/** Debug logging — stripped in production builds */
export const devLog = (...args) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

export const devWarn = (...args) => {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
};

export const devGroup = (label, fn) => {
  if (!import.meta.env.DEV) return;
  console.group(label);
  try {
    fn();
  } finally {
    console.groupEnd();
  }
};
