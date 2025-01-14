/**
 * Custom error class representing a runtime error that occurred within an ArvoHandler.
 */
export class ArvoHandlerExecutionError extends Error {
    /**
     * Creates an instance of ArvoHandlerExecutionError.
     * @param {string} [message='Handler runtime error. Handle externally'] - The error message. Default is 'Handler runtime error. Handle externally'.
     */
    constructor(message: string = 'Handler runtime error. Handle externally') {
      super(message);
      this.name = 'ArvoHandlerExecutionError';
    }
  }