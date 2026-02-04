/*
  # Allow Multiple Rule Types Per Customer

  1. Changes
    - Remove unique constraint on `customer_id` in `auto_ticket_rules`
    - Add composite unique constraint on `(customer_id, rule_type)`
    - This allows a customer to have one invoice age rule AND one payment recency rule
*/

-- Remove the unique constraint on customer_id
ALTER TABLE auto_ticket_rules 
  DROP CONSTRAINT IF EXISTS auto_ticket_rules_customer_id_key;

-- Add a composite unique constraint to allow one of each rule type per customer
ALTER TABLE auto_ticket_rules 
  ADD CONSTRAINT auto_ticket_rules_customer_rule_type_key 
  UNIQUE (customer_id, rule_type);
