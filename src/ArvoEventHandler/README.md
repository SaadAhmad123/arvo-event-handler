---
title: ArvoEventHandler
group: Guides
---

# ArvoEventHandler

## Overview

The Arvo Event Handler is a TypeScript class designed to facilitate the handling of events as per an `ArvoContract` (see [arvo-core](https://saadahmad123.github.io/arvo-core/documents/ArvoContract.html)). It provides a robust and flexible way to create, manage, and execute event handlers for Arvo-based event driven systems.

## Key Components

1. `createArvoEventHandler`: Factory function for type-safe handler creation
2. `ArvoEventHandler`: Core handler class with version support
3. `IArvoEventHandler`: Interface for handler configuration
4. Built-in OpenTelemetry integration
5. Versioned event handling support

## Why Use It?

- **Version Support**: Handle different versions of events with type safety
- **Telemetry Integration**: Built-in OpenTelemetry support with distributed tracing
- **Type Safety**: Full TypeScript support with generics
- **Error Handling**: Automatic error event creation and propagation
- **Contract Validation**: Runtime validation of events against contracts
- **Execution Tracking**: Built-in execution unit tracking

## Sample Usage

```typescript
import { createArvoContract, logToSpan, createArvoEvent } from 'arvo-core';
import { createArvoEventHandler } from 'arvo-event-handler';
import { trace } from '@opentelemetry/api';

// Define your versioned contract
const myContract = createArvoContract({
  // Contract definition with versions
});

// Create a versioned handler
const myHandler = createArvoEventHandler({
  contract: myContract,
  executionunits: 100,
  handler: {
    // Handler for version 0.0.1
    '0.0.1': async ({ event, source }) => {
      // Version-specific handling
      logToSpan({
        level: 'DEBUG',
        message: 'Processing v0.0.1 event',
      });
      return {
        type: 'event.processed',
        data: {
          /* v0.0.1 response */
        },
      };
    },
    // Handler for version 0.0.2
    '0.0.2': async ({ event, source }) => {
      logToSpan({
        level: 'DEBUG',
        message: 'Processing v0.0.2 event',
      });
      return {
        type: 'event.processed',
        data: {
          /* v0.0.2 response */
        },
      };
    },
  },
});

// Execute the handler
const event = createArvoEvent({ ... });
const results = await myHandler.execute(event);
```

## Key Features

1. **Version Management**:

   - Support for multiple contract versions
   - Version-specific handlers
   - Automatic version detection from event schema

2. **Telemetry**:

   - OpenTelemetry span creation
   - Attribute propagation
   - Distributed tracing support
   - Error tracking

3. **Type Safety**:

   - Version-specific type checking
   - Contract validation
   - Runtime schema validation

4. **Error Handling**:
   - Automatic error event creation
   - Error context preservation
   - Telemetry integration for errors

## Event Processing Flow

1. **Initialization**:

   - Create telemetry span
   - Set execution context

2. **Version Resolution**:

   - Parse event schema version
   - Select appropriate handler
   - Validate against version contract

3. **Execution**:

   - Run version-specific handler
   - Collect telemetry
   - Track execution units

4. **Response Processing**:
   - Create result events
   - Propagate context
   - Handle errors if any

## Advanced Features

### Telemetry Configuration

```typescript
const handler = createArvoEventHandler({
  contract: myContract,
  executionunits: 100,
});
```

## Best Practices

1. Always provide handlers for all contract versions
2. Use telemetry for debugging and monitoring
3. Handle version upgrades gracefully
4. Set appropriate execution units
5. Leverage type safety features

## Notes

- Handlers must be provided for all versions in the contract
- Event schema version must match contract version
- System errors are automatically routed to event source
- Telemetry context is preserved across the execution chain

For detailed API documentation, see the inline code documentation.

## Execution diagrams

See the MermaidMD diagram [here](https://github.com/SaadAhmad123/arvo-event-handler/tree/main/src/ArvoEventHandler/ExecutionDiagrams.md)
