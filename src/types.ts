import AbstractArvoEventHandler from "./AbstractArvoEventHandler";

/**
* Makes properties optional except specified keys
* 
* @template T - Original type
* @template K - Keys to keep required
* 
* @example
* ```typescript
* interface User {
*   id: number;
*   name: string; 
* }
* 
* type PartialUser = PartialExcept<User, 'id'>;
* // Results in: { id: number; name?: string; }
* ```
*/
export type PartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> & Pick<T, K>;

/**
* OpenTelemetry configuration for event handlers
*/
export type ArvoEventHandlerOpenTelemetryOptions = {
 inheritFrom: 'EVENT' | 'CONTEXT';
};

/**
* Factory function type for creating event handlers
* 
* @template T - Configuration parameter type
*/
export type EventHandlerFactory<T> = (param: T) => AbstractArvoEventHandler;