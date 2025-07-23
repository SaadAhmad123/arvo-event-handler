---
title: 'ArvoResumable'
group: Guides
---

> Really bad temporary documentation by GenAI (Claude). Will update manually later. Sorry...

# ArvoResumable

A stateful orchestration handler for managing distributed workflows in the Arvo event-driven system. ArvoResumable provides a handler-based approach to workflow orchestration that prioritizes explicit control and simplicity over declarative abstractions.

## Overview

ArvoResumable addresses fundamental challenges in event-driven architecture by providing a straightforward imperative programming model for workflow orchestration. Unlike state machine approaches, it uses handler functions that give developers direct control over workflow logic, making debugging easier and reducing the learning curve for teams familiar with traditional programming patterns.

### Key Capabilities

- **Handler-based workflow orchestration** with explicit state control
- **Contract-driven event validation** with runtime schema enforcement
- **Distributed resource locking** for transaction safety
- **Comprehensive OpenTelemetry integration** for observability
- **Automatic error handling** with system error event generation
- **Support for orchestrator chaining** and nested workflow patterns
- **Multi-domain event routing** and organization
- **Graduated complexity** allowing simple workflows to remain simple

## Getting Started

### Basic Setup

```typescript
import { createArvoResumable, SimpleMachineMemory } from 'arvo-xstate';
import { createArvoOrchestratorContract, createArvoContract } from 'arvo-core';
import { z } from 'zod';

// Define your orchestrator contract
const userProcessingContract = createArvoOrchestratorContract({
  uri: '#/orchestrators/userprocessing',
  type: 'com.user.processing',
  versions: {
    '1.0.0': {
      init: z.object({
        userId: z.string(),
        action: z.enum(['create', 'update', 'delete'])
      }),
      complete: z.object({
        success: z.boolean(),
        message: z.string()
      })
    }
  }
});

// Define service contracts
const validationService = createArvoContract({
  uri: '#/services/validation',
  type: 'com.validation.check',
  versions: {
    '1.0.0': {
      accepts: z.object({
        userId: z.string(),
        data: z.any()
      }),
      emits: {
        'evt.validation.success': z.object({
          valid: z.boolean(),
          issues: z.array(z.string()).optional()
        })
      }
    }
  }
});

// Create the orchestrator
const orchestrator = createArvoResumable({
  contracts: {
    self: userProcessingContract.version('1.0.0'),
    services: {
      validation: validationService.version('1.0.0')
    }
  },
  memory: new SimpleMachineMemory(),
  executionunits: 1,
  handler: {
    '1.0.0': async ({ context, input, service, contracts }) => {
      // Handle initialization
      if (input) {
        return {
          context: {
            userId: input.data.userId,
            action: input.data.action,
            step: 'validating'
          },
          services: [{
            type: 'com.validation.check',
            data: {
              userId: input.data.userId,
              data: input.data
            }
          }]
        };
      }

      // Handle service responses
      if (service?.type === 'evt.validation.success') {
        if (service.data.valid) {
          return {
            context: { ...context, step: 'completed' },
            output: {
              success: true,
              message: 'User processing completed successfully'
            }
          };
        } else {
          return {
            output: {
              success: false,
              message: `Validation failed: ${service.data.issues?.join(', ')}`
            }
          };
        }
      }
    }
  }
});

// Execute workflow
const result = await orchestrator.execute(initializationEvent);
```

## Multi-Domain Event Broadcasting

ArvoResumable supports sophisticated multi-domain event distribution, enabling advanced workflow patterns including human-in-the-loop operations, external system integrations, and custom processing pipelines.

### Understanding Domains

Domains represent different processing contexts or routing namespaces for events. They enable sophisticated event distribution patterns where a single handler response can create multiple events for different processing pipelines.

### Domain Assignment Rules

When returning events from a handler, you can specify domains using the `domain` field:

1. **Array Processing**: Each element in the `domain` array creates a separate ArvoEvent instance
2. **`undefined` in Array Resolution**: `undefined` elements resolve to: `event.contract.domain ?? triggeringEvent.domain ?? handler.contract.domain ?? null`
3. **`null` in Array Resolution**: `null` elements resolve to events which `domain: null`
3. **Automatic Deduplication**: Duplicate domains are automatically removed to prevent redundant events
4. **Default Behavior**: Omitting the `domain` field (or setting to `undefined`) defaults to `[null]` (single event, no domain)

### Domain Broadcasting Patterns

```typescript
handler: {
  '1.0.0': async ({ context, input, service }) => {
    if (input) {
      return {
        context: { userId: input.data.userId },
        services: [
          // Standard internal processing
          {
            type: 'com.validation.check',
            data: { userId: input.data.userId }
          },
          
          // External system integration  
          {
            domain: ['external'],
            type: 'com.approval.request',
            data: { 
              userId: input.data.userId,
              requiresApproval: true 
            }
          },
          
          // Multi-domain event for parallel processing
          {
            domain: ['analytics', 'audit', null],
            type: 'com.user.action.logged',
            data: { 
              action: 'user_processing_started',
              userId: input.data.userId 
            }
          }
        ]
      };
    }
  }
}
```

### Error Broadcasting

System errors are automatically broadcast to all relevant processing contexts:
- Source event domain (`event.domain`)
- Handler contract domain (`handler.contract.domain`) 
- No-domain context (`null`)

Duplicates are automatically removed, so if `event.domain === handler.contract.domain`, only two error events are created instead of three.

## Handler Function Architecture

### Handler Signature

Each version in your contract maps to a handler function with this signature:

```typescript
async ({ 
  span,           // OpenTelemetry span for tracing
  metadata,       // Complete workflow metadata (null for new workflows)
  collectedEvents,// Type-safe map of collected service events
  context,        // Current workflow state (null for new workflows)
  input,          // Initialization event data (only for start events)
  service,        // Service response event data (only for callbacks)
  contracts       // Available contracts for validation
}) => {
  // Handler logic here
  return {
    context?: any,    // Updated workflow state
    output?: any,     // Completion data (terminates workflow)
    services?: any[]  // Service invocation events
  };
}
```

### Handler Parameters

- **`span`**: OpenTelemetry span for distributed tracing and logging
- **`metadata`**: Complete workflow metadata including status, subject, event tracking
- **`collectedEvents`**: Type-safe access to events collected from previous service calls
- **`context`**: Your workflow's custom state data
- **`input`**: Present only for initialization events (workflow start)
- **`service`**: Present only for service response events (callbacks)
- **`contracts`**: Contract definitions for type validation and event creation

### Return Values

- **`context`**: Updated workflow state to persist (merged with existing state)
- **`output`**: Completion event data that terminates the workflow
- **`services`**: Array of service invocation events to emit

## Event Collection and Processing

ArvoResumable automatically collects service response events and makes them available through the `collectedEvents` parameter:

```typescript
handler: {
  '1.0.0': async ({ collectedEvents, context }) => {
    // Access collected events by type with full type safety
    const validationEvents = collectedEvents['evt.validation.success'] || [];
    const approvalEvents = collectedEvents['evt.approval.completed'] || [];
    
    // Process collected events
    const allValidationsComplete = validationEvents.length >= context.expectedValidations;
    const hasApproval = approvalEvents.some(event => event.data.approved);
    
    if (allValidationsComplete && hasApproval) {
      return {
        output: {
          success: true,
          message: 'All requirements met'
        }
      };
    }
    
    // Continue waiting for more events
    return { context };
  }
}
```

## Workflow Lifecycle Management

### Status Management

ArvoResumable automatically manages workflow status:

- **`active`**: Workflow can accept and process events
- **`done`**: Workflow has completed and will ignore additional events

```typescript
handler: {
  '1.0.0': async ({ metadata, input, service }) => {
    // Check current status
    if (metadata?.status === 'done') {
      // This won't happen as the orchestrator filters these out
      return;
    }
    
    // Return output to complete workflow (sets status to 'done')
    if (shouldComplete) {
      return {
        output: { result: 'completed' }
      };
    }
    
    // Continue workflow (keeps status as 'active')
    return {
      context: updatedState,
      services: [/* more service calls */]
    };
  }
}
```

### Event Tracking

The orchestrator automatically tracks:

- **Consumed events**: Last event processed by the workflow
- **Produced events**: Events emitted in the last execution
- **Expected events**: Events anticipated from service calls

```typescript
handler: {
  '1.0.0': async ({ metadata }) => {
    // Access event history
    const lastConsumed = metadata?.events.consumed;
    const lastProduced = metadata?.events.produced;
    const expectedEvents = metadata?.events.expected;
    
    console.log(`Last event: ${lastConsumed?.type}`);
    console.log(`Produced ${lastProduced?.length} events last time`);
    console.log(`Expecting responses for ${Object.keys(expectedEvents || {}).length} events`);
  }
}
```

## Parent-Child Orchestration Relationships

ArvoResumable supports hierarchical workflow execution through parent-child orchestration patterns.

### Creating Child Orchestrations

```typescript
handler: {
  '1.0.0': async ({ input, context }) => {
    if (input?.data.requiresSubWorkflow) {
      return {
        context: { ...context, waitingForChild: true },
        services: [{
          type: 'com.child.orchestrator',
          data: {
            parentSubject$$: context.currentSubject, // Pass parent context
            childData: input.data.childRequirements
          },
          // Child might run in different domain
          domain: ['processing.child']
        }]
      };
    }
  }
}
```

### Handling Child Completion

When child orchestrators complete, their completion events are automatically routed back to the parent's domain context:

```typescript
handler: {
  '1.0.0': async ({ service, context }) => {
    // Handle child orchestrator completion
    if (service?.type === 'evt.child.orchestrator.complete') {
      return {
        context: { 
          ...context, 
          childResult: service.data,
          waitingForChild: false 
        },
        output: {
          success: true,
          childResults: service.data
        }
      };
    }
  }
}
```

### Domain Context in Parent-Child Relationships

- **Parent orchestrator** operates in one domain (e.g., `'internal'`)
- **Child orchestrator** might operate in a different domain (e.g., `'external'`) 
- When the child completes, its completion event is routed back to the **parent's domain context**
- Each orchestrator can operate in its own domain regardless of parent-child relationship

## Advanced Patterns

### Conditional Workflow Branching

```typescript
handler: {
  '1.0.0': async ({ input, service, context }) => {
    if (input) {
      // Branch based on input data
      if (input.data.priority === 'high') {
        return {
          context: { ...input.data, fastTrack: true },
          services: [{
            type: 'com.priority.processor',
            data: input.data
          }]
        };
      } else {
        return {
          context: { ...input.data, fastTrack: false },
          services: [{
            type: 'com.standard.processor', 
            data: input.data
          }]
        };
      }
    }
  }
}
```

### Event Aggregation

```typescript
handler: {
  '1.0.0': async ({ collectedEvents, context }) => {
    const approvals = collectedEvents['evt.approval.response'] || [];
    const validations = collectedEvents['evt.validation.complete'] || [];
    
    // Wait for all required approvals
    const requiredApprovals = context.approvers?.length || 0;
    const approvedCount = approvals.filter(a => a.data.approved).length;
    
    if (approvedCount >= requiredApprovals && validations.length > 0) {
      return {
        output: {
          approved: true,
          approvers: approvals.map(a => a.data.approver)
        }
      };
    }
    
    // Still waiting for more approvals
    return { context };
  }
}
```

### Human-in-the-Loop Workflows

```typescript
handler: {
  '1.0.0': async ({ input, service, context }) => {
    if (input && input.data.requiresHumanApproval) {
      return {
        context: { ...input.data, awaitingApproval: true },
        services: [{
          // Route to external approval system
          domain: ['external.approval'],
          type: 'com.human.approval.request',
          data: {
            requestId: input.data.id,
            description: input.data.description,
            urgency: input.data.priority
          }
        }]
      };
    }
    
    if (service?.type === 'evt.human.approval.response') {
      if (service.data.approved) {
        return {
          context: { ...context, approved: true },
          output: {
            success: true,
            approvedBy: service.data.approver
          }
        };
      } else {
        return {
          output: {
            success: false,
            reason: service.data.reason
          }
        };
      }
    }
  }
}
```

## Error Handling Philosophy

ArvoResumable implements a dual-layered error handling strategy:

### Transaction Errors vs System Error Events

**Transaction Errors** (`TransactionViolation`) represent critical infrastructure failures that prevent the orchestrator from maintaining core guarantees:
- Lock acquisition failures
- State persistence errors
- Event subject validation failures

These errors immediately halt execution and are thrown upward for infrastructure-level handling.

**System Error Events** represent workflow-level failures during normal business operations:
- Invalid event data
- Contract violations  
- Handler execution failures

These become part of the normal event flow, allowing workflows to implement recovery mechanisms.

### Error Handling in Practice

```typescript
// Transaction errors are thrown and must be caught by infrastructure
try {
  const result = await orchestrator.execute(event);
  // Process successful result
} catch (error) {
  if (error instanceof TransactionViolation) {
    // Handle infrastructure failure
    logger.error('Infrastructure error:', error.cause);
    // Implement retry logic or alert operations
  }
  // Other violations bubble up for system handling
}

// System errors become events that can be handled in workflows
handler: {
  '1.0.0': async ({ service }) => {
    if (service?.type === 'sys.validation.error') {
      // Handle service failure gracefully
      return {
        output: {
          success: false,
          error: 'Validation service unavailable'
        }
      };
    }
  }
}
```

## Resource Locking and Concurrency

ArvoResumable provides distributed resource locking to ensure workflow safety:

### Automatic Locking Strategy

- **Single service**: Locking disabled by default (sequential execution)
- **Multiple services**: Locking enabled by default (potential concurrency)
- **Manual override**: Specify `requiresResourceLocking` explicitly

```typescript
const orchestrator = createArvoResumable({
  // ... other config
  requiresResourceLocking: true, // Force locking even for single service
  handler: {
    '1.0.0': async ({ context }) => {
      // Critical section protected by distributed lock
      return {
        context: { ...context, criticalUpdate: Date.now() }
      };
    }
  }
});
```

### Lock Acquisition Behavior

- Exclusive locks prevent concurrent workflow execution
- Lock failures trigger `TransactionViolation` errors
- Locks are automatically released after execution completes
- Failed lock acquisition indicates resource contention

## Observability and Monitoring

### OpenTelemetry Integration

ArvoResumable provides comprehensive tracing through OpenTelemetry:

```typescript
handler: {
  '1.0.0': async ({ span, input }) => {
    // Add custom span attributes
    span.setAttribute('workflow.user_id', input?.data.userId);
    span.setAttribute('workflow.priority', input?.data.priority);
    
    // Log workflow progress
    logToSpan({
      level: 'INFO',
      message: `Processing user ${input?.data.userId}`
    }, span);
    
    return {
      context: { userId: input?.data.userId },
      services: [{ /* service call */ }]
    };
  }
}
```

### Performance Monitoring

Key metrics automatically tracked:
- Lock acquisition timing
- Handler execution duration
- Event processing latency
- State persistence performance
- Resource utilization patterns

## Testing ArvoResumable Workflows

### Unit Testing Handlers

```typescript
import { describe, it, expect } from 'vitest';

describe('UserProcessingHandler', () => {
  it('should handle initialization correctly', async () => {
    const handler = userProcessingHandler['1.0.0'];
    
    const result = await handler({
      span: mockSpan,
      metadata: null,
      collectedEvents: {},
      context: null,
      input: {
        type: 'com.user.processing',
        data: { userId: 'user123', action: 'create' }
      },
      service: null,
      contracts: mockContracts
    });
    
    expect(result?.context?.userId).toBe('user123');
    expect(result?.services).toHaveLength(1);
    expect(result?.services?.[0].type).toBe('com.validation.check');
  });
  
  it('should complete workflow on successful validation', async () => {
    const handler = userProcessingHandler['1.0.0'];
    
    const result = await handler({
      span: mockSpan,
      metadata: mockMetadata,
      collectedEvents: {},
      context: { userId: 'user123', step: 'validating' },
      input: null,
      service: {
        type: 'evt.validation.success',
        data: { valid: true }
      },
      contracts: mockContracts
    });
    
    expect(result?.output?.success).toBe(true);
  });
});
```

### Integration Testing

```typescript
import { SimpleMachineMemory } from 'arvo-xstate';

describe('UserProcessing Integration', () => {
  it('should complete full workflow', async () => {
    const memory = new SimpleMachineMemory();
    const orchestrator = createArvoResumable({
      memory,
      // ... config
    });
    
    // Send initialization event
    const initResult = await orchestrator.execute(initEvent);
    expect(initResult.events).toHaveLength(1);
    expect(initResult.events[0].type).toBe('com.validation.check');
    
    // Send validation response
    const validationResponse = createValidationSuccessEvent(/*...*/);
    const finalResult = await orchestrator.execute(validationResponse);
    expect(finalResult.events).toHaveLength(1);
    expect(finalResult.events[0].type).toBe('evt.com.user.processing.complete');
  });
});
```

## Best Practices

### Handler Design

1. **Keep handlers pure**: Avoid side effects beyond returned actions
2. **Use type safety**: Leverage TypeScript for compile-time validation
3. **Handle all cases**: Consider initialization, service responses, and error scenarios
4. **Implement idempotency**: Handlers may be called multiple times with the same input

### State Management

1. **Minimize state size**: Store only essential workflow data
2. **Use immutable updates**: Return new state objects rather than modifying existing ones
3. **Validate state transitions**: Ensure state changes are logical and consistent
4. **Consider serialization**: State must be JSON serializable for persistence

### Error Handling

1. **Distinguish error types**: Use appropriate error handling for different failure modes
2. **Implement graceful degradation**: Handle service failures without breaking workflows
3. **Provide meaningful errors**: Include context and recovery suggestions in error messages
4. **Monitor error patterns**: Track and alert on recurring error conditions

### Performance Optimization

1. **Optimize handler execution**: Keep business logic efficient and avoid blocking operations
2. **Minimize state size**: Large state objects impact serialization and network performance
3. **Batch service calls**: Group related service invocations when possible
4. **Use appropriate locking**: Enable locking only when necessary for correctness

## Deployment Considerations

### Memory Requirements

- State size impacts memory usage and serialization performance
- Consider archiving completed workflows to manage memory consumption
- Monitor memory usage patterns under load

### Scaling Strategies

- Horizontal scaling through multiple orchestrator instances
- Partition workflows by subject or domain for better distribution
- Use external state stores for high-volume scenarios

### Monitoring and Alerts

- Track workflow completion rates and error patterns
- Monitor lock contention and acquisition times
- Alert on transaction violations and infrastructure failures
- Implement health checks for orchestrator instances

## Migration from State Machines

ArvoResumable provides a simpler alternative to state machine orchestration:

### Key Differences

| Aspect | State Machines | ArvoResumable |
|--------|---------------|---------------|
| **Programming Model** | Declarative state definitions | Imperative handler functions |
| **Learning Curve** | Requires XState knowledge | Uses familiar async/await patterns |
| **Debugging** | State visualization tools | Standard debugging techniques |
| **Complexity** | Good for complex state logic | Better for linear workflows |
| **Type Safety** | Event-driven type inference | Direct TypeScript types |

### When to Choose ArvoResumable

- **Linear workflows** with simple request-response patterns  
- **Teams familiar** with imperative programming
- **Rapid prototyping** requirements
- **Simple state management** needs
- **Direct control** over workflow logic preferred

### When to Choose State Machines

- **Complex state logic** with many conditional branches
- **Parallel execution** requirements
- **Visual workflow** modeling important
- **Declarative approach** preferred
- **Complex timing** and guard conditions

## Conclusion

ArvoResumable provides a powerful yet approachable framework for distributed workflow orchestration. By emphasizing explicit control and familiar programming patterns, it enables teams to build reliable event-driven systems without the complexity of state machine abstractions.

The combination of contract-driven development, comprehensive error handling, multi-domain event routing, and built-in observability makes ArvoResumable an excellent choice for teams looking to implement robust workflow orchestration in their event-driven architectures.

Whether you're building simple request-response workflows or complex multi-service orchestrations, ArvoResumable provides the tools and patterns needed to create maintainable, scalable, and reliable distributed systems.