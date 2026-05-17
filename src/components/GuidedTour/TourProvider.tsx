import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tour, TourStep, getTourById } from './tours';

interface TourContextValue {
  activeTour: Tour | null;
  currentStep: number;
  isActive: boolean;
  voiceEnabled: boolean;
  startTour: (tourId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  endTour: () => void;
  toggleVoice: () => void;
  currentStepData: TourStep | null;
  totalSteps: number;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const currentStepData = activeTour?.steps[currentStep] || null;
  const totalSteps = activeTour?.steps.length || 0;
  const isActive = activeTour !== null;

  const speak = useCallback((text: string) => {
    if (!voiceEnabled) return;
    speechSynthesis.cancel();
    const cleanText = text.replace(/'/g, "'").replace(/\n/g, '. ');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  const navigateToStep = useCallback(async (step: TourStep) => {
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
      await new Promise(r => setTimeout(r, step.delay || 600));
    } else if (step.delay) {
      await new Promise(r => setTimeout(r, step.delay));
    }
  }, [navigate, location.pathname]);

  const startTour = useCallback((tourId: string) => {
    const tour = getTourById(tourId);
    if (!tour) return;
    speechSynthesis.cancel();
    setActiveTour(tour);
    setCurrentStep(0);
    const firstStep = tour.steps[0];
    if (firstStep) {
      navigateToStep(firstStep).then(() => {
        speak(`${firstStep.title}. ${firstStep.content}`);
      });
    }
  }, [navigateToStep, speak]);

  const nextStep = useCallback(async () => {
    if (!activeTour) return;
    const nextIdx = currentStep + 1;
    if (nextIdx >= activeTour.steps.length) {
      endTour();
      return;
    }
    speechSynthesis.cancel();
    const step = activeTour.steps[nextIdx];
    setCurrentStep(nextIdx);
    await navigateToStep(step);
    speak(`${step.title}. ${step.content}`);
  }, [activeTour, currentStep, navigateToStep, speak]);

  const prevStep = useCallback(async () => {
    if (!activeTour || currentStep <= 0) return;
    speechSynthesis.cancel();
    const prevIdx = currentStep - 1;
    const step = activeTour.steps[prevIdx];
    setCurrentStep(prevIdx);
    await navigateToStep(step);
    speak(`${step.title}. ${step.content}`);
  }, [activeTour, currentStep, navigateToStep, speak]);

  const endTour = useCallback(() => {
    speechSynthesis.cancel();
    setActiveTour(null);
    setCurrentStep(0);
  }, []);

  const toggleVoice = useCallback(() => {
    if (voiceEnabled) {
      speechSynthesis.cancel();
    }
    setVoiceEnabled(v => !v);
  }, [voiceEnabled]);

  // Re-speak when voice is turned on mid-tour
  useEffect(() => {
    if (voiceEnabled && currentStepData) {
      speak(`${currentStepData.title}. ${currentStepData.content}`);
    }
  }, [voiceEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
    };
  }, []);

  return (
    <TourContext.Provider
      value={{
        activeTour,
        currentStep,
        isActive,
        voiceEnabled,
        startTour,
        nextStep,
        prevStep,
        endTour,
        toggleVoice,
        currentStepData,
        totalSteps,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}
