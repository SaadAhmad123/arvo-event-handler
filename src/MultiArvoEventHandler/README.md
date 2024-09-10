---
title: MultiArvoEventHandler
group: Guides
---

# MultiArvoEventHandler

## Overview

`MultiArvoEventHandler` is a flexible and powerful event handling class designed to process multiple event types across different ArvoContracts. This handler offers greater versatility compared to the more specialized `ArvoEventHandler`, as it's not bound to a specific contract or event type.

## Why Use It?

- **Flexibility**: Handle multiple event types with a single handler.
- **Cross-Contract Compatibility**: Work across different ArvoContracts seamlessly.
- **Unified Interface**: Provide a consistent approach to diverse event processing.
- **Telemetry Integration**: Built-in support for OpenTelemetry for comprehensive tracing and monitoring.
- **Error Handling**: Robust error management with standardized error events.

## Difference from `ArvoEventHandler`

The main differences between `MultiArvoEventHandler` and `ArvoEventHandler` are:

1. Contract Binding:

   - `ArvoEventHandler` is bound to a specific `ArvoContract` and handles events of a single type defined by that contract.
   - `MultiArvoEventHandler` is not bound to any specific contract and can handle multiple event types.

2. Event Validation:

   - `ArvoEventHandler` validates incoming events against the contract it's bound to.
   - `MultiArvoEventHandler` doesn't perform any built-in validation, leaving it up to the handler implementation.

3. Event Creation:

   - `ArvoEventHandler` uses an event factory created from its bound contract to create output events.
   - `MultiArvoEventHandler` uses a generic `createArvoEvent` function to create output events.

4. Flexibility:

   - `ArvoEventHandler` is more structured and type-safe due to its contract binding.
   - `MultiArvoEventHandler` is more flexible and can be used in scenarios where you need to handle various event types that might not conform to a single contract.

5. Use Case:
   - `ArvoEventHandler` is ideal for scenarios where you have well-defined contracts and want to ensure type safety and validation.
   - `MultiArvoEventHandler` is suitable for more general-purpose event handling, where you might need to process various event types without the constraints of a specific contract.

Both handlers share similar telemetry and error handling mechanisms, but `MultiArvoEventHandler` provides more flexibility at the cost of some type safety and built-in validation.

## Key Components

1. `MultiArvoEventHandler`: The main class that processes events.
2. `createMultiArvoEventHandler`: A factory function to create instances of `MultiArvoEventHandler`.
3. `IMultiArvoEventHandler`: Interface defining the structure of the handler.

## Sample Usage

```typescript
import { createArvoContract, logToSpan, createArvoEvent } from 'arvo-core';
import { createMultiArvoEventHandler } from 'arvo-event-handler';
import { trace } from '@opentelemetry/api';

const multiEventHandler = createMultiArvoEventHandler({
  source: 'com.multi.handler',
  executionunits: 100,
  handler: async ({ event, source }) => {

    // Some OpenTelemetry logging if needed
    logToSpan({
      level: "DEBUG",
      message: "Hello World",
    })
    trace.getActiveSpan().setAttribute('attr', 'value')

    switch(event.type) {
      case 'com.user.registered':
        return {
          type: 'com.user.welcome',
          data: { message: `Welcome, ${event.data.username}!` }
        };
      case 'com.transaction.complete':
        return {
          type: 'com.transaction.receipt',
          data: { transactionId: event.data.id, status: 'completed' }
        };
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }
});

// Using the handler
const inputEvent = createArvoEvent({
  type: 'com.user.registered',
  data: { username: 'johndoe' },
  // ... other ArvoEvent properties
};)

const results = await multiEventHandler.execute(inputEvent);
console.log(results);
```

## Benefits

1. **Versatility**: Handle various event types without creating multiple specialized handlers.
2. **Scalability**: Easily extend to accommodate new event types without modifying existing code.
3. **Observability**: Integrated OpenTelemetry support for enhanced monitoring and debugging.
4. **Standardization**: Consistent event handling patterns across your application.
5. **Error Resilience**: Built-in error handling and reporting mechanism.

## What Happens During Execution

1. **Span Creation**: An OpenTelemetry span is created for each execution, capturing important metadata.
2. **Telemetry and Context Propagation**: Creates and manages OpenTelemetry spans for each execution. The distributed telemetry is enabled by the `traceparent` and `tracestate` fields in the `ArvoEvent`. If they are present then then trace context is inherited, otherwise it is created anew.
3. **Handler Execution**: The user-defined handler function is called with the input event.
4. **Result Processing**: Output events are created based on the handler's return value.
5. **Error Handling**: Any errors are caught, logged, and transformed into standardized error events.
6. **Event Creation**: Generates properly formatted Arvo events based on the handler's output.
7. **Telemetry Propagaation in Output**: Relevant attributes and status are set on the span for observability. Moreover, the span headers (`traceparent` and `tracestate`) are set in the generated event.

## Configuration Options

- `source`: Identifier for events produced by this handler.
- `executionunits`: Default execution cost associated with the handler.
- `handler`: The main function that processes events.
- `spanKind`: Optional configuration for OpenTelemetry span attributes.

## Error Handling

The system automatically generates error events when exceptions occur during processing. These events follow a standard schema (`ArvoErrorSchema`) and are prefixed with `sys.{source}.error`.

## Notes

- The `executionunits` parameter can be used to track computational costs or resource usage.
- Always handle potential errors in your handler implementation.

For more detailed information, refer to the inline documentation in the source code.

## Execution diagrams

See the Mermaid MD diagram [here](https://github.com/SaadAhmad123/arvo-event-handler/tree/main/src/MultiArvoEventHandler/ExecutionDiagrams)
