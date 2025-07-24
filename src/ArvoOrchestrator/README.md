---
title: 'ArvoOrchestrator'
group: Guides
---

# ArvoOrchestrator

## Overview

The `ArvoOrchestrator` serves as the cornerstone of the Arvo state machine workflow system, orchestrating the intricate dance between state machine execution, lifecycle management, and event processing. At its heart, it coordinates three essential components: the Machine Registry for definition management, Machine Memory for state persistence, and the Execution Engine for processing logic. This harmonious integration enables robust workflow management while maintaining comprehensive telemetry and error handling.

## Getting Started

Begin your journey with Arvo through a straightforward initialization process. The following example demonstrates setting up a basic orchestrator with two machines:

```typescript
import { createArvoOrchestrator, SimpleMachineMemory, setupArvoMachine } from 'arvo-xstate';

const machine1 = setupArvoMachine(...).createMachine(...);
const machine2 = setupArvoMachine(...).createMachine(...);

const orchestrator = createArvoOrchestrator({
  memory: new SimpleMachineMemory(),
  executionunits: 1,
  machines: [machine1, machine2]
});

// Process an event - now returns structured result
const { events } = await orchestrator.execute(incomingEvent);
```

## Multi-Domain Event Broadcasting

The ArvoOrchestrator supports sophisticated multi-domain event distribution through array-based domain specification. This powerful feature allows events to be broadcast across multiple processing contexts simultaneously.

### Understanding Domains

In Arvo, domains represent different processing contexts or routing namespaces for events. They enable sophisticated event distribution patterns where a single handler response can create multiple events for different processing pipelines.

### Domain Assignment Rules

When returning events from a state machine, you can specify domains using the `domain` field:

1. **Array Processing**: Each element in the `domain` array creates a separate ArvoEvent instance
2. **`undefined` in Array Resolution**: `undefined` elements resolve to: `event.contract.domain ?? triggeringEvent.domain ?? handler.contract.domain ?? null`
3. **`null` in Array Resolution**: `null` elements resolve to events which `domain: null`
3. **Automatic Deduplication**: Duplicate domains are automatically removed to prevent redundant events
4. **Default Behavior**: Omitting the `domain` field (or setting to `undefined`) defaults to `[null]` (single event, no domain)

### Domain Broadcasting Patterns

```typescript
// In your state machine - creates 2 events: one for each domain
xstate.emit(({ context }) => ({
  domains: ['domain1', 'domain2'],
  type: 'com.service.call',
  data: { request: context.request }
}))

// Creates up to 3 events:
// - Event with domain: 'analytics'
// - Event with domain: event.contract.domain ?? triggeringEvent.domain ?? handler.contract.domain ?? null
// - Event with domain: null
xstate.emit(({ context }) => ({
  domains: ['analytics', undefined, null],
  type: 'com.process.update',
  data: { status: context.status }
}))

// Single event with explicit no-domain routing
xstate.emit(({ context }) => ({
  domains: [null],
  type: 'com.standard.process',
  data: { data: context.data }
}))

// Single event with no-domain (equivalent to omitting domain field)
xstate.emit(({ context }) => ({
  domains: undefined, // or omit domains entirely
  type: 'com.default.process',
  data: { data: context.data }
}))
```

### Error Broadcasting

System errors are automatically broadcast to all relevant processing contexts:
- Source event domain (`event.domain`)
- Handler contract domain (`handler.contract.domain`)
- No-domain context (`null`)

Duplicates are automatically removed, so if `event.domain === handler.contract.domain`, only two error events are created instead of three.

### Domain Usage Example

```typescript
const handler = setupArvoMachine({
  contracts: {
    self: userContract,
    services: {
      approvalService: approvalContract.version('1.0.0'),
      analyticsService: analyticsContract.version('1.0.0'),
    }
  },
  // ... other config
}).createMachine({
  // ... machine config
  states: {
    processing: {
      entry: [
        // Standard internal processing
        xstate.emit(({ context }) => ({
          type: 'com.approval.request',
          data: { userId: context.userId }
        })),
        
        // External system integration
        xstate.emit(({ context }) => ({
          domains: ['external'],
          type: 'com.notification.send',
          data: { message: context.notification }
        })),
        
        // Multi-domain event for parallel processing
        xstate.emit(({ context }) => ({
          domains: ['analytics', 'audit', null],
          type: 'com.user.action.logged',
          data: { action: context.action }
        }))
      ]
    }
  }
});
```

## Operation overview

When an event arrives at the `ArvoOrchestrator`, it initiates a sophisticated sequence of operations. The process begins by establishing a telemetry context through OpenTelemetry instantiated via `ArvoOpenTelemetry.getInstance()` from `arvo-core`, enabling comprehensive monitoring of the execution lifecycle. The orchestrator then acquires an exclusive lock on the workflow subject, ensuring isolated execution and data consistency.

State retrieval follows lock acquisition, determining whether this is a new workflow initialization or the continuation of an existing execution. For new workflows, the orchestrator validates that the triggering event matches the expected initialization type. Existing workflows undergo proper routing to ensure the event reaches the correct instance.

The orchestrator resolves machine definitions through its registry, considering version requirements and compatibility. After validating input against established contracts, the execution engine processes the event within the machine's context. The resulting raw events undergo transformation and validation before emission as fully-formed Arvo events.

## Event Routing in Arvo Orchestrator

The Arvo Orchestrator implements a sophisticated event routing mechanism that manages event flow through the workflow system. The routing system operates at multiple levels, handling both direct workflow events and orchestrator-to-orchestrator communications through a parent-child relationship model.

### Core Routing Logic

Event routing in the orchestrator is primarily determined by three key fields in the event structure:

- `type`: Determines the event's purpose and target handler
- `subject`: Contains orchestration routing information including version and chain data
- `to`: Specifies the final destination service for the event

When an event arrives, the orchestrator first validates the subject format to ensure proper routing information. For new workflow instances, it verifies that the event type matches the orchestrator's source identifier. For existing workflows, it confirms that the subject's orchestrator name matches the current orchestrator, preventing misrouted events from causing unintended state changes.

### Parent-Child Workflow Routing

The orchestrator supports hierarchical workflow execution through parent-child routing. When a workflow needs to trigger a sub-workflow, it includes a `parentSubject$$` in the event data. The orchestrator uses this information to maintain execution context across workflow boundaries, enabling complex workflow compositions while preserving execution isolation and state management.

### Routing Control

Events can influence their routing through several mechanisms:

- `redirectto`: Overrides default routing for completion events
- `accesscontrol`: Carries permissions and routing restrictions
- `parsed(event.subject).meta.redirectto`: Provides routing hints for orchestration chains

This comprehensive routing system ensures events are processed by the correct workflow instances while maintaining proper execution boundaries and workflow relationships.


## Multi-Domain Event Broadcasting

The `ArvoOrchestrator` supports sophisticated multi-domain event distribution through symbolic domain specification. This powerful feature allows events to be broadcast across multiple processing contexts simultaneously, enabling advanced workflow patterns including human-in-the-loop operations, external system integrations, and custom processing pipelines.

### Understanding Domains with Symbolic Resolution

In Arvo, domains represent different processing contexts or routing namespaces for events. The orchestrator uses symbolic constants from `ArvoDomain` to enable dynamic domain resolution based on execution context, making domain assignment both flexible and predictable.

When emitting events from state machines, you can specify domains using symbolic references that resolve at runtime:

```typescript
import { ArvoDomain } from 'arvo-xstate';

// In your state machine
xstate.emit(({ context }) => ({
  // Standard internal processing (no domain)
  type: 'com.approval.request',
  data: { userId: context.userId }
}))

// Multi-domain event with symbolic resolution
xstate.emit(({ context }) => ({
  domains: [
    ArvoDomain.FROM_TRIGGERING_EVENT,  // Inherit source event's domain
    'analytics',                       // Explicit analytics domain
    null                               // Standard processing pipeline
  ],
  type: 'com.user.action.logged',
  data: { action: context.action }
}))
```

### Domain Resolution and Deduplication

The orchestrator automatically resolves symbolic domains and removes duplicates to ensure efficient event emission. For example, if `ArvoDomain.FROM_TRIGGERING_EVENT` resolves to `'user.processing'` and that's the same as the handler's contract domain, only one event is created instead of duplicates. This intelligent deduplication happens after domain resolution, ensuring optimal performance while maintaining the flexibility of symbolic domain specification.

Available symbolic constants include `FROM_TRIGGERING_EVENT` (inherit from source event), `FROM_SELF_CONTRACT` (use handler's domain), and `FROM_EVENT_CONTRACT` (use target service domain). You can mix these with explicit domain strings and `null` for comprehensive domain routing control.

### Domain Context in Parent-Child Relationships

- **Parent orchestrator** operates in one domain (e.g., `'internal'`)
- **Child orchestrator** might operate in a different domain (e.g., `'external'`) 
- When the child completes, its completion event is routed back to the **parent's domain context**
- Each orchestrator can operate in its own domain regardless of parent-child relationship

## Detailed Component Integration and Operation

The Lock Management system provides critical execution isolation through the Machine Memory interface. Upon event arrival, the orchestrator acquires an exclusive lock, preventing concurrent modifications to workflow instances. This distributed locking mechanism ensures data consistency throughout the execution cycle. Lock acquisition failures, whether due to existing locks or system issues, trigger appropriate error events and execution termination. The lock persists through the entire execution, protecting all state transitions and modifications until a robust cleanup process ensures proper release.

State Management forms the foundation of workflow processing. After securing execution locks, the orchestrator retrieves the current workflow state, including execution status, values, and machine snapshots. The system performs comprehensive validation to ensure state consistency and compatibility with incoming events and machine versions. New instances undergo initialization with strict validation protocols, while existing workflows receive careful compatibility checks. State persistence occurs atomically after successful processing, with thorough validation ensuring data integrity throughout the workflow lifecycle.

Event Processing follows a rigorous pipeline of validation and transformation. Each incoming event undergoes multiple validation stages to verify subject format, contract compliance, and business rules. The Machine Registry handles sophisticated event routing based on version and type information, ensuring proper workflow targeting. Event transformation maintains data integrity while converting raw machine events into fully-formed Arvo events, preserving ordering guarantees crucial for distributed scenarios.

Here's an addition to the documentation explaining the error handling approach:

## Error Handling Philosophy: Transaction Errors vs System Error Events

The ArvoOrchestrator implements a carefully designed dual-layered error handling strategy that distinguishes between transaction errors and system error events. This separation reflects a fundamental principle in distributed systems: infrastructure failures should be handled differently from workflow-level errors.

Transaction errors, implemented through the `ArvoTransactionError` class, represent critical infrastructure failures that prevent the orchestrator from maintaining its core guarantees. These errors occur during fundamental operations like event subject invalidation, lock acquisition, state rading or state persistence, where the system cannot ensure data consistency or execution isolation. When a transaction error occurs, the orchestrator immediately halts execution and throws the error upward, allowing infrastructure-level error handling to take over. This immediate propagation is crucial because these errors indicate the system cannot safely continue operation without compromising data integrity or execution guarantees.

System error events, on the other hand, represent workflow-level failures that occur during normal business operations. These events manifest as special sys.{source}.error type events and handle scenarios like invalid event data, contract violations, or machine execution failures. Unlike transaction errors, system error events become part of the normal event flow, allowing workflows to implement sophisticated error handling and recovery mechanisms. This approach treats workflow failures as expected business scenarios rather than exceptional cases, enabling graceful degradation and maintaining system stability. The orchestrator automatically routes these error events back to the workflow initiator, ensuring proper notification while preserving the execution context.

The rationale behind this separation stems from the different requirements for handling infrastructure failures versus business logic errors. Infrastructure failures require immediate attention and often indicate system-wide issues that need operational intervention. Business logic errors, while important, should be handled within the workflow's context, allowing for retry mechanisms, compensation workflows, or alternative execution paths. This dual-layer approach enables the orchestrator to maintain robust error handling while providing flexibility for workflow-specific error recovery strategies, ultimately contributing to a more resilient and maintainable system.

## Telemetry Integration

The Arvo Orchestrator implements comprehensive OpenTelemetry integration, providing deep visibility into workflow execution and system health. The telemetry system creates hierarchical spans that track each phase of execution while collecting detailed metrics about system performance. Critical measurements include lock acquisition timing, state persistence latency, event processing duration, and resource utilization patterns. This detailed monitoring enables real-time operational insights and rapid issue diagnosis while maintaining minimal overhead on workflow execution.

Each telemetry span captures the complete context of its execution phase, including relevant attributes and events. The hierarchical structure allows operators to trace workflow execution from initial lock acquisition through final state persistence, with clear visibility into each intermediate step. This comprehensive telemetry integration proves invaluable for performance optimization, capacity planning, and issue resolution.

## Performance Optimization

Performance optimization in the Arvo Orchestrator centers on efficient resource utilization and careful monitoring of system behavior. The orchestrator implements sophisticated strategies for managing lock acquisition times, optimizing state persistence, and ensuring efficient event processing. Each aspect of the system undergoes regular analysis to identify bottlenecks and optimization opportunities.

Lock management optimization focuses on minimizing acquisition times while preventing deadlocks and ensuring fair resource distribution. State persistence strategies balance the need for consistency with performance requirements, implementing efficient storage and retrieval patterns. Event processing optimization ensures high throughput while maintaining ordering guarantees and proper context propagation.

Resource cleanup receives particular attention, with careful implementation ensuring timely release of system resources while maintaining system responsiveness. The telemetry system provides crucial insights for these optimization efforts, helping identify high-impact improvements while ensuring system reliability remains uncompromised.

## Deployment Considerations

Deploying the Arvo Orchestrator requires careful attention to system architecture and operational requirements. The system supports various deployment patterns, from single-instance deployments for simple scenarios to sophisticated distributed configurations with shared or local state management. Each deployment pattern offers different tradeoffs between simplicity, scalability, and operational complexity.

Network configuration plays a crucial role in distributed deployments, requiring careful attention to latency, reliability, and security considerations. Storage requirements vary based on workflow volumes and retention needs, demanding appropriate capacity planning and backup strategies. Monitoring setup ensures comprehensive visibility into system health and performance, while backup strategies protect against data loss and enable disaster recovery.

## Operational Excellence

Successful operation of the Arvo Orchestrator depends on well-defined procedures and careful attention to system health. System operators should maintain comprehensive monitoring of health metrics, including lock acquisition patterns, state persistence performance, and event processing throughput. Regular analysis of these metrics helps identify trends and potential issues before they impact system reliability.

Incident response procedures should define clear escalation paths and resolution strategies for common failure scenarios. Documentation must remain current, capturing deployment configurations, operational procedures, and known issue resolutions. Capacity planning should consider both current requirements and future growth, ensuring the system maintains performance as demand increases.

## Custom Implementation

The Arvo Orchestrator supports extensive customization through well-defined interfaces. Organizations can implement specialized behavior while maintaining core system guarantees through custom components:

```typescript
const orchestrator = new ArvoOrchestrator({
  executionunits: 1,
  memory: customMemory,
  registry: customRegistry,
  executionEngine: customEngine,
});
```

Custom memory implementations might provide specialized storage strategies or integration with existing infrastructure. Custom registries could implement sophisticated version management or specialized machine resolution logic. Custom execution engines might provide integration with different state machine frameworks or implement specialized execution patterns.

## Detailed Implementation Flow

For a comprehensive understanding of the ArvoOrchestrator's execution flow, sequence diagrams, and internal workings, please refer to our [detailed technical diagrams](https://github.com/SaadAhmad123/arvo-xstate/blob/main/src/ArvoOrchestrator/ExecutionDiagrams.md).
