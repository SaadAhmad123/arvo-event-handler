[![SonarCloud](https://sonarcloud.io/images/project_badges/sonarcloud-white.svg)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)

# Arvo - A toolkit for event driven applications (arvo-event-handler)

The orchestration and event processing foundation for [Arvo](https://www.arvo.land/), providing everything from simple event handlers to complex workflow orchestration with state machines and imperative resumables.

This package provides three core handler patterns and essential infrastructure for building reliable event-driven systems:

**ArvoEventHandler** - Stateless event processors that transform contract-defined events. Perfect for microservices, API endpoints, and simple request-response patterns.

**ArvoOrchestrator** - Declarative state machine-based workflow orchestration using XState. Ideal for complex business processes with clear states, transitions, and parallel execution.

**ArvoResumable** - Imperative workflow handlers with explicit state management. Best for dynamic workflows, AI-driven decision logic, and teams preferring traditional programming patterns.

## Installation
```bash
npm install arvo-event-handler arvo-core xstate@5 zod@3
```

## Quick Start

### Simple Event Handler
```typescript
import { createArvoEventHandler } from 'arvo-event-handler';
import { createArvoContract } from 'arvo-core';
import { z } from 'zod';

const contract = createArvoContract({
  uri: '#/contracts/user',
  type: 'user.validate',
  versions: {
    '1.0.0': {
      accepts: z.object({ email: z.string().email() }),
      emits: {
        'evt.user.validate.success': z.object({ valid: z.boolean() })
      }
    }
  }
});

const handler = createArvoEventHandler({
  contract,
  executionunits: 0,
  handler: {
    '1.0.0': async ({ event }) => ({
      type: 'evt.user.validate.success',
      data: { valid: true }
    })
  }
});
```

### State Machine Orchestrator
```typescript
import { createArvoOrchestrator, setupArvoMachine } from 'arvo-event-handler';
import { createArvoOrchestratorContract } from 'arvo-core';

const orchestratorContract = createArvoOrchestratorContract({
  uri: '#/orchestrator/workflow',
  name: 'workflow',
  versions: {
    '1.0.0': {
      init: z.object({ userId: z.string() }),
      complete: z.object({ result: z.string() })
    }
  }
});

const machine = setupArvoMachine({
  contracts: {
    self: orchestratorContract.version('1.0.0'),
    services: { /* service contracts */ }
  }
}).createMachine({
  // XState machine definition
});

const orchestrator = createArvoOrchestrator({
  machines: [machine],
  memory, // IMachineMemory implementation
  executionunits: 0
});
```

### Imperative Resumable
```typescript
import { createArvoResumable } from 'arvo-event-handler';

const resumable = createArvoResumable({
  contracts: {
    self: orchestratorContract,
    services: { /* service contracts */ }
  },
  memory,
  executionunits: 0,
  handler: {
    '1.0.0': async ({ input, service, context }) => {
      if (input) {
        return {
          context: { userId: input.data.userId },
          services: [{ type: 'user.validate', data: { /* ... */ } }]
        };
      }
      // Handle service responses and return output
    }
  }
});
```

## Additional Core Components

**IMachineMemory** - State persistence interface with optimistic locking for distributed workflow coordination. Includes `SimpleMachineMemory` for local development.

**Error Handling** - Three-tier system: business logic failures as contract events, transient errors as system events, and violations for critical failures requiring immediate intervention.

**SimpleEventBroker** - Local in-memory FIFO queue-based event broker for testing and development without external message infrastructure. Also suitable for production deployments with limited scale (≤1000 users).

**SimpleMachineMemory** - Local in-memory hash map based storage for testing and development without external database infrastructure.

All handlers implement the same interface `IArvoEventHandler` regardless of complexity, enabling consistent patterns across your entire system. Contract-first development ensures type safety and validation at every boundary. Built-in OpenTelemetry integration provides complete observability. State management through pluggable interfaces supports any storage backend from memory to distributed databases.

The same handler code works locally with in-memory brokers during development and in production with distributed message systems and persistent state stores.

## What is `arvo-event-handler`?

The `arvo-event-handler` is one of the two foundational packages in the Arvo ecosystem, alongside `arvo-core`. Together, they provide the complete foundation for building event-driven applications that are distributed system-compliant. Explore additional tools and integrations in the `@arvo-tools` namespace.

Learn more at the official Arvo website: [https://www.arvo.land/](https://www.arvo.land/)

## Documentation

Complete guides, API reference, and tutorials at [https://www.arvo.land/](https://www.arvo.land/)

## License

MIT - See [LICENSE.md](LICENSE.md)

---

### SonarCloud Metrics

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=bugs)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=coverage)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)