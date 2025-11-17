import { Component } from "solid-js";

interface CustomAlertProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "info" | "warning" | "error" | "success";
}

const CustomAlert: Component<CustomAlertProps> = (props) => {
  if (!props.isOpen) return null;

  const getIcon = () => {
    switch (props.type) {
      case "warning":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-yellow-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
        );
      case "error":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
        );
      case "success":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-green-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
        );
      default:
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-blue-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clip-rule="evenodd"
            />
          </svg>
        );
    }
  };

  const getColorClasses = () => {
    switch (props.type) {
      case "warning":
        return "bg-yellow-950/40 border-yellow-700";
      case "error":
        return "bg-red-950/40 border-red-700";
      case "success":
        return "bg-green-950/40 border-green-700";
      default:
        return "bg-blue-950/40 border-blue-700";
    }
  };

  return (
    <div class="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        class="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={props.onClose}
      />

      {/* Alert Box */}
      <div
        class={`relative bg-neutral-900 rounded-lg shadow-2xl max-w-md w-full border ${getColorClasses()} p-6`}
      >
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0">{getIcon()}</div>

          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-semibold text-white mb-2">{props.title}</h3>
            <p class="text-neutral-300 text-sm leading-relaxed">
              {props.message}
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={props.onClose}
            class="flex-shrink-0 p-1 rounded hover:bg-neutral-800 transition-colors"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 text-neutral-400 hover:text-white"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* OK Button */}
        <div class="mt-6 flex justify-end">
          <button
            onClick={props.onClose}
            class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomAlert;
