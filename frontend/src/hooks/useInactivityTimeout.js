import { useState, useEffect, useRef, useCallback } from "react";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"];

const useInactivityTimeout = ({
  timeoutMinutes,
  warningMinutes = 2,
  onTimeout,
  onWarning,
}) => {
  const timeoutRef = useRef(null);
  const warningRef = useRef(null);
  const [showWarning, setShowWarning] = useState(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
  }, []);

  const resetTimers = useCallback(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return;

    clearTimers();
    setShowWarning(false);

    const timeoutMs = timeoutMinutes * 60 * 1000;
    const warningMs = (timeoutMinutes - warningMinutes) * 60 * 1000;

    if (warningMs > 0) {
      warningRef.current = setTimeout(() => {
        setShowWarning(true);
        if (onWarning) onWarning();
      }, warningMs);
    }

    timeoutRef.current = setTimeout(() => {
      setShowWarning(false);
      if (onTimeout) onTimeout();
    }, timeoutMs);
  }, [timeoutMinutes, warningMinutes, onTimeout, onWarning, clearTimers]);

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return undefined;

    const handleActivity = () => resetTimers();

    ACTIVITY_EVENTS.forEach(event =>
      window.addEventListener(event, handleActivity, { passive: true })
    );

    resetTimers();

    return () => {
      ACTIVITY_EVENTS.forEach(event =>
        window.removeEventListener(event, handleActivity)
      );
      clearTimers();
    };
  }, [timeoutMinutes, resetTimers, clearTimers]);

  const continueSession = useCallback(() => {
    setShowWarning(false);
    resetTimers();
  }, [resetTimers]);

  return { showWarning, continueSession };
};

export default useInactivityTimeout;
