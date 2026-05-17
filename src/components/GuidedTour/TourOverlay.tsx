import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Volume2,
  VolumeX,
  Compass,
} from 'lucide-react';
import { useTour } from './TourProvider';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function TourOverlay() {
  const {
    isActive,
    currentStepData,
    currentStep,
    totalSteps,
    nextStep,
    prevStep,
    endTour,
    voiceEnabled,
    toggleVoice,
    activeTour,
  } = useTour();

  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [arrowDirection, setArrowDirection] = useState<string>('top');
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const findTarget = useCallback(() => {
    if (!currentStepData?.target) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(currentStepData.target);
    if (!el) {
      setTargetRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    const padding = currentStepData.spotlightPadding ?? 8;
    setTargetRect({
      top: rect.top - padding + window.scrollY,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });
  }, [currentStepData]);

  useEffect(() => {
    if (!isActive) {
      setVisible(false);
      return;
    }

    setVisible(false);
    const delay = currentStepData?.delay || 100;
    const timer = setTimeout(() => {
      findTarget();
      setVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [isActive, currentStep, currentStepData, findTarget]);

  // Re-calculate on scroll/resize
  useEffect(() => {
    if (!isActive) return;

    const handleUpdate = () => findTarget();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isActive, findTarget]);

  // Position tooltip relative to target
  useEffect(() => {
    if (!isActive || !visible) return;

    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    const tooltipWidth = 380;
    const tooltipHeight = tooltip.offsetHeight || 220;
    const margin = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!targetRect || !currentStepData?.target) {
      // Center the tooltip
      setTooltipStyle({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: tooltipWidth,
        zIndex: 10002,
      });
      setArrowDirection('none');
      return;
    }

    const pos = currentStepData.position || 'bottom';
    const scrollY = window.scrollY;
    const tTop = targetRect.top - scrollY;
    const tLeft = targetRect.left;
    const tWidth = targetRect.width;
    const tHeight = targetRect.height;
    const tCenterX = tLeft + tWidth / 2;
    const tCenterY = tTop + tHeight / 2;

    let style: React.CSSProperties = {
      position: 'fixed',
      width: tooltipWidth,
      zIndex: 10002,
    };

    let aStyle: React.CSSProperties = { position: 'absolute' };
    let aDir = pos;

    if (pos === 'bottom' && tTop + tHeight + tooltipHeight + margin < vh) {
      style.top = tTop + tHeight + margin;
      style.left = Math.max(margin, Math.min(tCenterX - tooltipWidth / 2, vw - tooltipWidth - margin));
      aStyle = { ...aStyle, top: -8, left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
      aDir = 'top';
    } else if (pos === 'top' && tTop - tooltipHeight - margin > 0) {
      style.top = tTop - tooltipHeight - margin;
      style.left = Math.max(margin, Math.min(tCenterX - tooltipWidth / 2, vw - tooltipWidth - margin));
      aStyle = { ...aStyle, bottom: -8, left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
      aDir = 'bottom';
    } else if (pos === 'right' && tLeft + tWidth + tooltipWidth + margin < vw) {
      style.top = Math.max(margin, Math.min(tCenterY - tooltipHeight / 2, vh - tooltipHeight - margin));
      style.left = tLeft + tWidth + margin;
      aStyle = { ...aStyle, left: -8, top: '50%', transform: 'translateY(-50%) rotate(45deg)' };
      aDir = 'left';
    } else if (pos === 'left' && tLeft - tooltipWidth - margin > 0) {
      style.top = Math.max(margin, Math.min(tCenterY - tooltipHeight / 2, vh - tooltipHeight - margin));
      style.left = tLeft - tooltipWidth - margin;
      aStyle = { ...aStyle, right: -8, top: '50%', transform: 'translateY(-50%) rotate(45deg)' };
      aDir = 'right';
    } else {
      // Fallback: below
      style.top = Math.min(tTop + tHeight + margin, vh - tooltipHeight - margin);
      style.left = Math.max(margin, Math.min(tCenterX - tooltipWidth / 2, vw - tooltipWidth - margin));
      aStyle = { ...aStyle, top: -8, left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
      aDir = 'top';
    }

    setTooltipStyle(style);
    setArrowStyle(aStyle);
    setArrowDirection(aDir);
  }, [targetRect, visible, isActive, currentStepData]);

  // Scroll target into view
  useEffect(() => {
    if (!targetRect || !visible) return;
    const scrollY = window.scrollY;
    const tTop = targetRect.top;
    const tBottom = tTop + targetRect.height;
    const viewTop = scrollY;
    const viewBottom = scrollY + window.innerHeight;

    if (tTop < viewTop + 100 || tBottom > viewBottom - 100) {
      window.scrollTo({
        top: tTop - 200,
        behavior: 'smooth',
      });
    }
  }, [targetRect, visible]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
      if (e.key === 'ArrowLeft') prevStep();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isActive, nextStep, prevStep, endTour]);

  if (!isActive || !currentStepData || !visible) return null;

  const isCenter = !targetRect || !currentStepData.target;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="tour-overlay" style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>
      {/* Dark overlay with spotlight cutout */}
      <svg
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 10000, pointerEvents: 'auto' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) { /* clicking backdrop does nothing intentionally */ }
        }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top - window.scrollY}
                width={targetRect.width}
                height={targetRect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0, 0, 0, 0.65)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Spotlight ring */}
      {targetRect && (
        <div
          className="animate-pulse"
          style={{
            position: 'fixed',
            top: targetRect.top - window.scrollY - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            border: '2px solid rgba(16, 185, 129, 0.6)',
            borderRadius: 14,
            zIndex: 10001,
            pointerEvents: 'none',
            boxShadow: '0 0 0 4px rgba(16, 185, 129, 0.15)',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          ...tooltipStyle,
          pointerEvents: 'auto',
        }}
        className={`bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl transition-all duration-300 ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        {/* Arrow */}
        {arrowDirection !== 'none' && targetRect && (
          <div
            style={arrowStyle}
            className="w-4 h-4 bg-gray-900 border-gray-700"
          />
        )}

        {/* Progress bar */}
        <div className="h-1 bg-gray-800 rounded-t-2xl overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Compass size={14} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm leading-tight">
                  {currentStepData.title}
                </h3>
                {activeTour && (
                  <p className="text-gray-500 text-xs mt-0.5">
                    {activeTour.name} - Step {currentStep + 1} of {totalSteps}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={endTour}
              className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <p className="text-gray-300 text-sm leading-relaxed mb-4">
            {currentStepData.content}
          </p>

          {currentStepData.action && (
            <div className="mb-4 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-emerald-400 text-xs font-medium">
                {currentStepData.action}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={toggleVoice}
                className={`p-1.5 rounded-lg transition-colors ${
                  voiceEnabled
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800'
                }`}
                title={voiceEnabled ? 'Mute narration' : 'Enable voice narration'}
              >
                {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              <span className="text-gray-600 text-xs">
                {voiceEnabled ? 'Voice on' : 'Voice off'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <button
                  onClick={prevStep}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
              )}
              <button
                onClick={isLastStep ? endTour : nextStep}
                className="flex items-center gap-1 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-sm font-medium"
              >
                {isLastStep ? 'Finish' : 'Next'}
                {!isLastStep && <ChevronRight size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
