---
title: ArvoEventRouter
group: Guides
---

# ArvoEventRouter

## Overview

ArvoEventRouter is a TypeScript class designed to route ArvoEvents to appropriate event handlers. It provides a centralized mechanism for managing and executing multiple event handlers based on event types.

## Why Use It?

- Centralized event routing.
- Automatic handler selection based on event type
- Built-in error handling and reporting
- OpenTelemetry integration for observability
- Type-safe event handling

## Usecases

**1. Centralized Event Processing**
Use ArvoEventRouter as a central point for processing various types of events in your application. This is particularly useful in microservices architectures or event-driven systems where different event handlers are bundled into one service

**2. Event Transformation Pipeline**
Create a pipeline of event transformations by chaining multiple routers, each responsible for a specific stage of event processing.

```typescript
const stage1Router = new ArvoEventRouter({
  /* config */
});
const stage2Router = new ArvoEventRouter({
  /* config */
});

const stage1Results = await stage1Router.execute(initialEvent);
const finalResults = await stage2Router.execute(stage1Results[0]);
```

## Sample Usage

```typescript
import { createArvoEventRouter, createArvoEventHandler } from 'arvo-event-handler';
import { createArvoEvent } from 'arvo-core';

// Create event handlers
const handler1 = createArvoEventHandler(/* ... */);
const handler2 = createArvoEventHandler(/* ... */);

// Initialize the router
const router = createArvoEventRouter({
  handlers: [handler1, handler2],
  source: 'my.service.router',
  executionunits: 10,
});

// Create an event
const event = createArvoEvent({
  to: 'my.service.router',
  type: 'my.event.type',
  // ... other event properties
});

// Execute the router
const results = await router.execute(event);
console.log('Router results:', results);
```

## Benefits

1. **Centralized Routing**: Manage multiple event handlers in one place.
2. **Automatic Handler Selection**: Routes events to the appropriate handler based on event type.
3. **Error Handling**: Built-in error catching and reporting.
4. **Observability**: Integrated with OpenTelemetry for tracing and monitoring.
5. **Flexibility**: Can handle various event types and sources.

## What Happens in the Code

1. **Initialization**: The router is initialized with a set of handlers and configuration.
2. **Event Validation**: Checks if the event's destination matches the router's source.
3. **Handler Selection**: Finds the appropriate handler based on the event type.
4. **Execution**: Runs the selected handler with the event.
5. **Result Processing**: Processes the handler's output and creates new events.
6. **Error Handling**: Catches any errors and creates error events if necessary.
7. **Telemetry**: Creates and manages OpenTelemetry spans for the entire process.

## Advanced Usage

- Custom span kinds can be specified for OpenTelemetry and OpenInference.
- The router can be configured to handle specific sources or act as a general router.
- Error events can be customized and routed back to the original event source.

## Notes

- Ensure that there are no duplicate handlers for the same event type.
- The `executionunits` parameter can be used to track computational costs.
- OpenTelemetry context is propagated through the `traceparent` and `tracestate` fields.

For more detailed information, refer to the inline documentation in the source code.

## Execution diagrams

See the MermaidMD diagram [here](https://github.com/SaadAhmad123/arvo-event-handler/tree/main/src/ArvoEventRouter/ExecutionDiagrams.md)
