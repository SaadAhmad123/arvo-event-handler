---
title: ArvoEventHandler
group: Guides
---

# ArvoEventHandler

## Overview

The Arvo Event Handler is a TypeScript class designed to facilitate the handling of events as per an `ArvoContract` (see [arvo-core](https://saadahmad123.github.io/arvo-core/documents/ArvoContract.html)). It provides a robust and flexible way to create, manage, and execute event handlers for Arvo-based event driven systems.

## Key Components

1. `createArvoEventHandler`: A factory function for creating `ArvoEventHandler` instances.
2. `ArvoEventHandler`: The main class that encapsulates the logic for handling Arvo events.
3. `IArvoEventHandler`: An interface defining the structure of an Arvo event handler.

## Why Use It?

- **Type Safety**: Leverages TypeScript's type system to ensure correct usage of `ArvoContract` and `ArvoEvent`.
- **Telemetry Integration**: Built-in support for OpenTelemetry, allowing for easy tracing and monitoring.
- **Flexible Configuration**: Allows customization of execution units, source identifiers, and span kinds.
- **Error Handling**: Automatically handles and reports errors, creating system error events when necessary.
- **Contract Validation**: Ensures that events conform to the specified Arvo contract.

## Sample Usage

```typescript
import { createArvoContract, logToSpan, createArvoEvent } from 'arvo-core';
import { createArvoEventHandler } from 'arvo-event-handler';
import { trace } from '@opentelemetry/api';


// Define your Arvo contract
const myContract = createArvoContract({
  // Contract definition
});

// Create an event handler
const myHandler = createArvoEventHandler({
  contract: myContract,
  executionunits: 100,
  handler: async ({ event, source }) => {
    // Handler implementation
    console.log(`Handling event from ${source}`);
    console.log(`Event data:`, event.data);

    // Some OpenTelemetry logging if needed
    logToSpan({
      level: "DEBUG",
      message: "Hello World",
    })
    trace.getActiveSpan().setAttribute('attr', 'value')

    // Return the result
    return {
      type: 'my.event.processed',
      data: {
        // Processed data
      }
    };
  }
});

// Execute the handler
const inputEvent = createArvoEvent({
  // Your input event conforming to the contract
};)
const results = await myHandler.execute(inputEvent);
console.log('Handler results:', results);
```

## Benefits

1. **Standardization**: Provides a consistent way to handle events across different Arvo contracts.
2. **Modularity**: Allows for easy composition and reuse of event handlers.
3. **Observability**: Built-in telemetry support aids in monitoring and debugging.
4. **Type Safety**: Reduces runtime errors by leveraging TypeScript's type system.
5. **Automatic Error Handling**: Simplifies error management and reporting.

## What Happens in the Code

1. **Event Validation**: The handler validates incoming events against the contract.
2. **Telemetry and Context Propagation**: Creates and manages OpenTelemetry spans for each execution. The distributed telemetry is enabled by the `traceparent` and `tracestate` fields in the `ArvoEvent`. If they are present then then trace context is inherited, otherwise it is created anew.
3. **Execution**: Runs the user-defined handler function with the validated event.
4. **Result Processing**: Formats and validates the handler's output.
5. **Error Handling**: Catches and reports any errors, creating error events if necessary.
6. **Event Creation**: Generates properly formatted Arvo events based on the handler's output.
7. **Telemetry Propagaation in Output**: Relevant attributes and status are set on the span for observability. Moreover, the span headers (`traceparent` and `tracestate`) are set in the generated event.

## Advanced Usage

- Custom span kinds can be specified for fine-grained control over telemetry.
- The `source` field can be overridden, though this is generally not recommended.
- Multiple events can be returned from a single handler execution.

## Notes

- The `executionunits` parameter can be used to track computational costs or resource usage.
- Always handle potential errors in your handler implementation.

For more detailed information, refer to the inline documentation in the source code.