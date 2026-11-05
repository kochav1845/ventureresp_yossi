/*
  # "Ask the bot for a change, the owner approves by text"

  The owner asked for the Heimish Invites change bot, here: an admin asks the
  site's AI assistant for a change to the app, a Claude session on the owner's
  PC does the work, the owner gets a text, and nothing ships until he answers
  YES.

  Same shape as hi's devbot (migrations 20261028190000 / 20261029200000) so the
  two are easy to reason about together, with two differences VentureResp needs:

  * Requests carry an organization_id, and admins only ever see their own
    organization's. hi is single-tenant; this database holds two.
  * Only an approver listed in devbot_approvers can say YES, and approvers are
    per organization. is_admin() alone is not enough to ship code.

  Status flow:
    new -> thinking -> asking (back to the admin) -> waiting_approval (texted)
        -> approved -> deploying -> done
    or rejected / failed / cancelled.
*/

-- ── Requests ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devbot_requests (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  requester_email text,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  title           text,
  status          text NOT NULL DEFAULT 'new' CHECK (status IN
                    ('new','thinking','asking','waiting_approval','approved','deploying','done','rejected','failed','cancelled')),
  stage_note      text,
  summary         text,
  -- What the change touches beyond app code, as the bot reported it:
  -- migrations, edge functions, secrets.
  server          text,
  approval_code   text,
  preview_url     text,
  branch          text,
  base_commit     text,
  -- Claude usage limit hit: wait rather than fail.
  retry_at        timestamptz
);
CREATE INDEX IF NOT EXISTS devbot_requests_status ON public.devbot_requests (status, id);
CREATE INDEX IF NOT EXISTS devbot_requests_org ON public.devbot_requests (organization_id, created_at DESC);

-- ── Messages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devbot_messages (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id bigint NOT NULL REFERENCES public.devbot_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- admin / owner: people (owner = answered by text) | bot: its replies
  -- progress: what it is doing now | system: status changes
  role       text NOT NULL CHECK (role IN ('admin','owner','bot','progress','system')),
  body       text NOT NULL,
  -- quick answers for the bot's questions: [{"q":"…","choices":["…"]}]
  choices    jsonb,
  author     uuid,
  handled    boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS devbot_messages_request ON public.devbot_messages (request_id, id);

-- ── The PC worker's heartbeat ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devbot_worker (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_seen     timestamptz,
  busy_request  bigint,
  note          text
);
INSERT INTO public.devbot_worker (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Who may say YES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devbot_approvers (
  user_id         uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  -- E.164. The text has to come from this number to count.
  phone           text,
  added_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.devbot_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devbot_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devbot_worker    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devbot_approvers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read their org's change requests" ON public.devbot_requests;
CREATE POLICY "Admins read their org's change requests"
  ON public.devbot_requests FOR SELECT TO authenticated
  USING (is_admin() AND organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Admins read their org's change messages" ON public.devbot_messages;
CREATE POLICY "Admins read their org's change messages"
  ON public.devbot_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM devbot_requests r
    WHERE r.id = devbot_messages.request_id
      AND r.organization_id = get_user_org_id()
  ) AND is_admin());

DROP POLICY IF EXISTS "Admins read the worker heartbeat" ON public.devbot_worker;
CREATE POLICY "Admins read the worker heartbeat"
  ON public.devbot_worker FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Approvers read their org's approver list" ON public.devbot_approvers;
CREATE POLICY "Approvers read their org's approver list"
  ON public.devbot_approvers FOR SELECT TO authenticated
  USING (is_admin() AND organization_id = get_user_org_id());

-- Everything is written through the RPCs below or by the worker (service role).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.devbot_requests  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.devbot_messages  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.devbot_worker    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.devbot_approvers FROM anon, authenticated;
GRANT SELECT ON public.devbot_requests, public.devbot_messages, public.devbot_worker, public.devbot_approvers TO authenticated;

-- ── RPCs ──────────────────────────────────────────────────────────────────

/** File a change request. Called by the AI assistant's request_app_change tool. */
CREATE OR REPLACE FUNCTION public.devbot_new(p_body text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  rid  bigint;
  body text := btrim(coalesce(p_body, ''));
  v_org uuid := get_user_org_id();
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Only an admin can ask for a change'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization for the current user'; END IF;
  IF body = '' THEN RAISE EXCEPTION 'Say what to change'; END IF;

  INSERT INTO devbot_requests (created_by, requester_email, organization_id, title)
  VALUES (auth.uid(),
          (SELECT email FROM user_profiles WHERE id = auth.uid()),
          v_org,
          left(regexp_replace(body, '\s+', ' ', 'g'), 80))
  RETURNING id INTO rid;

  INSERT INTO devbot_messages (request_id, role, body, author)
  VALUES (rid, 'admin', left(body, 8000), auth.uid());

  RETURN rid;
END $$;

/** Answer the bot, or add to the request. */
CREATE OR REPLACE FUNCTION public.devbot_say(p_request bigint, p_body text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE body text := btrim(coalesce(p_body, ''));
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Only an admin can answer the bot'; END IF;
  IF body = '' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM devbot_requests WHERE id = p_request AND organization_id = get_user_org_id()) THEN
    RAISE EXCEPTION 'No such request';
  END IF;

  INSERT INTO devbot_messages (request_id, role, body, author)
  VALUES (p_request, 'admin', left(body, 8000), auth.uid());

  -- Hand it back to the bot unless it is mid-step or already shipping.
  UPDATE devbot_requests SET status = 'new', updated_at = now()
   WHERE id = p_request AND status NOT IN ('thinking','approved','deploying');
END $$;

/** Stop a request, unless it is already going live. */
CREATE OR REPLACE FUNCTION public.devbot_cancel(p_request bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Only an admin can cancel a change'; END IF;

  UPDATE devbot_requests
     SET status = 'cancelled', approval_code = NULL, updated_at = now()
   WHERE id = p_request
     AND organization_id = get_user_org_id()
     AND status NOT IN ('deploying','done','cancelled');

  IF found THEN
    INSERT INTO devbot_messages (request_id, role, body, handled)
    VALUES (p_request, 'system',
            'Cancelled by ' || coalesce((SELECT email FROM user_profiles WHERE id = auth.uid()), 'an admin'),
            true);
  END IF;
END $$;

/** Can the signed-in user approve changes? Drives the buttons in the chat. */
CREATE OR REPLACE FUNCTION public.devbot_can_approve()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM devbot_approvers a
    WHERE a.user_id = auth.uid()
      AND a.organization_id = get_user_org_id()
  );
$$;

/**
 * Approve or turn down a change from inside the chat. The text route does the
 * same thing from the edge function, on the service role.
 *
 * p_yes false with a note sends it back to the bot; false with no note turns it
 * down for good.
 */
CREATE OR REPLACE FUNCTION public.devbot_approve(p_request bigint, p_yes boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_note text := btrim(coalesce(p_note, ''));
  v_who  text;
BEGIN
  IF NOT devbot_can_approve() THEN RAISE EXCEPTION 'You are not an approver'; END IF;
  IF NOT EXISTS (SELECT 1 FROM devbot_requests
                  WHERE id = p_request
                    AND organization_id = get_user_org_id()
                    AND status = 'waiting_approval') THEN
    RAISE EXCEPTION 'That change is not waiting for approval';
  END IF;

  v_who := coalesce((SELECT email FROM user_profiles WHERE id = auth.uid()), 'the owner');

  IF p_yes THEN
    UPDATE devbot_requests SET status = 'approved', approval_code = NULL, updated_at = now()
     WHERE id = p_request;
    INSERT INTO devbot_messages (request_id, role, body, handled)
    VALUES (p_request, 'owner', 'Approved by ' || v_who || ' in the chat.', true);
  ELSIF v_note <> '' THEN
    UPDATE devbot_requests SET status = 'new', approval_code = NULL, updated_at = now()
     WHERE id = p_request;
    INSERT INTO devbot_messages (request_id, role, body, author)
    VALUES (p_request, 'owner', v_note, auth.uid());
    INSERT INTO devbot_messages (request_id, role, body, handled)
    VALUES (p_request, 'system', 'Sent back to the bot by ' || v_who || '.', true);
  ELSE
    UPDATE devbot_requests SET status = 'rejected', approval_code = NULL, updated_at = now()
     WHERE id = p_request;
    INSERT INTO devbot_messages (request_id, role, body, handled)
    VALUES (p_request, 'owner', 'Turned down by ' || v_who || '.', true);
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.devbot_new(text)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.devbot_say(bigint, text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.devbot_cancel(bigint)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.devbot_can_approve()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.devbot_approve(bigint, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devbot_new(text)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.devbot_say(bigint, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.devbot_cancel(bigint)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.devbot_can_approve()                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.devbot_approve(bigint, boolean, text) TO authenticated, service_role;

-- The owner is the approver for the live organization.
INSERT INTO public.devbot_approvers (user_id, organization_id, phone)
SELECT p.id, p.organization_id, '+13478893351'
FROM public.user_profiles p
WHERE p.email = 'a88933513@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET phone = EXCLUDED.phone;
