---
title: 'Arvo Domains'
group: Guides
---


# Arvo Domains - Technical Documentation

Domains are labels that indicate which execution context an event should route to. An execution context can represent a different event broker, topic, or functional part of the application that executes events fundamentally differently. For example, a human-in-the-loop event cannot be processed in the same execution plane because it requires delivery to a human for response outside the current context. If an event is labeled with a domain such as `'human.interaction'`, the event handling infrastructure routes it to the appropriate execution context. Domain is simply a label; how you leverage it depends on your architecture. Within any execution context, events have `domain: null` because they are already where they need to be. A non-null domain value indicates the event should route to a different broker, topic, or system.

## Domain Inheritance in Orchestrations

Orchestration chains automatically maintain domain context through the subject. When a parent orchestration spawns a child orchestration, the child inherits the parent's domain through `parentSubject$$`. The completion event automatically routes back through the parent's domain to maintain workflow coherence.

```typescript
// Parent orchestration emits child spawn
xstate.emit({
  type: 'child.orchestrator.init',
  data: {
    parentSubject$$: context.subject,  // Inherits domain
    value: 100
  }
});

// Child completes, routes back to parent's domain automatically
```

For service calls from orchestrations, you control the domain explicitly. If not specified, events default to `domain: null` and remain local.

```typescript
// Stays in current domain
xstate.emit({
  type: 'service.validate',
  data: { input: '...' }
});

// Routes to external domain
xstate.emit({
  type: 'external.service.call',
  data: { value: 100 },
  domain: ['external-system']
});
```

## Domain Behavior in Handlers

Handlers are stateless and have no parent context. By default, handler responses preserve the triggering event's domain to maintain execution context.

```typescript
// Routes back through triggering event's domain
return {
  type: 'evt.service.success',
  data: { result: '123' }
};

// Route to specific domain
return {
  type: 'evt.service.success',
  data: { result: '123' },
  domain: ['logging-domain']
};

// Domain-agnostic
return {
  type: 'evt.service.success',
  data: { result: '123' },
  domain: [ArvoDomain.AGNOSTIC]
};
```

# Designing Domain Boundaries
Cross-domain communication should be infrequent. If two components constantly exchange events across domains, they belong together. High cross-domain traffic indicates your separation boundary is incorrectly placed. The domain field forces you to be explicit about where separation exists in your system.

> **Warning** Domains, while being a powerful concept, can introduce significant design nuance and tracking complexity. Arvo recommends that when execution context boundaries exist and domained events need to move across them, an exchange layer should be implemented to facilitate that exchange. Within those domains, all events should default to domain: null and only emit domained events when they are required to escape outside the execution context.