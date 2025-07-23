---
title: ArvoEventHandler
group: Guides
---

# ArvoEventHandler - Implementation of a Reliable Event-Driven System

Event-driven architectures present distinct challenges in reliability and maintainability. Services must communicate dependably, manage errors effectively, and evolve without disrupting existing clients. The `ArvoEventHandler` addresses these challenges by transforming `ArvoContract` contracts into actively enforced rules for service communication. While `ArvoContract` defines a service's behaviour from the broader system's perspective, `ArvoEventHandler` binds with a contract to bring the service's functionality to life.

# Getting Started with `ArvoEventHandler`

This section provides a hands-on introduction to building your first event handler with ArvoEventHandler. You'll learn how to transform an ArvoContract into a working service that processes events reliably.

## Your First Event Handler

Let's build on the user registration contract from the ArvoContract guide and create a working event handler.

### Step 1: Set Up Your Contract and Dependencies

First, let's establish our contract and create some mock dependencies to simulate real-world services:

```typescript
// contracts/user-registration.ts
import { createArvoContract } from 'arvo-core';
import { z } from 'zod';

export const userRegistrationContract = createArvoContract({
    uri: '#/services/user/registration',
    type: 'com.user.register',
    versions: {
        '1.0.0': {
            accepts: z.object({
                email: z.string().email('Must be a valid email'),
                username: z.string().min(3, 'Username must be at least 3 characters'),
                password: z.string().min(8, 'Password must be at least 8 characters'),
            }),
            emits: {
                'evt.user.registered': z.object({
                    user_id: z.string(),
                    email: z.string(),
                    username: z.string(),
                    created_at: z.string().datetime(),
                }),
                'evt.user.registration.failed': z.object({
                    reason: z.string(),
                    error_code: z.enum(['EMAIL_EXISTS', 'USERNAME_TAKEN', 'INVALID_INPUT']),
                })
            }
        }
    }
});
```

Let's create a mock data for demostation purposes in `services/database.ts`

```typescript
export class UserDatabase {
    private emails = new Set<string>();
    private usernames = new Set<string>();

    async emailExists(email: string): Promise<boolean> {
        return this.emails.has(email);
    }

    async usernameExists(username: string): Promise<boolean> {
        return this.usernames.has(username);
    }

    async createUser(email: string, username: string, password: string): Promise<string> {
        // Simulate async database operation
        await new Promise(resolve => setTimeout(resolve, 10));
        
        this.emails.add(email);
        this.usernames.add(username);
        
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
```

### Step 2: Create Your Event Handler

Now let's create the actual event handler using the factory pattern in `handlers/user-registration-handler.ts`:

```typescript
import { createArvoEventHandler, type EventHandlerFactory } from 'arvo-event-handler';
import { logToSpan } from 'arvo-core';
import { userRegistrationContract } from '../contracts/user-registration';
import type { UserDatabase } from '../services/database';

type HandlerDependencies = {
    database: UserDatabase;
}

// Create the handler factory - this is the recommended pattern
export const userRegistrationHandlerFactory: EventHandlerFactory<HandlerDependencies> = ({
    database
}) => createArvoEventHandler({
  contract: userRegistrationContract,
  executionunits: 0.001, // Cost per execution (business-defined)
  handler: {
    '1.0.0': async ({ event, source, span }) => {
      logToSpan({
        level: 'INFO',
        message: `Processing user registration for ${event.data.email}`
      }, span);

      // Check if email already exists
      if (await database.emailExists(event.data.email)) {
        logToSpan({
          level: 'WARN',
          message: `Registration failed: Email ${event.data.email} already exists`
        }, span);

        return {
          type: 'evt.user.registration.failed',
          data: {
            reason: 'Email address already exists in the system',
            error_code: 'EMAIL_EXISTS'
          }
        };
      }

      // Check if username already exists
      if (await database.usernameExists(event.data.username)) {
        logToSpan({
          level: 'WARN',
          message: `Registration failed: Username ${event.data.username} already taken`
        }, span);

        return {
          type: 'evt.user.registration.failed',
          data: {
            reason: 'Username already taken',
            error_code: 'USERNAME_TAKEN'
          }
        };
      }

      // Create the user
      const userId = await database.createUser(
        event.data.email,
        event.data.username,
        event.data.password
      );

      logToSpan({
        level: 'INFO',
        message: `User ${userId} created successfully`
      }, span);

      // Return success event
      return {
        type: 'evt.user.registered',
        data: {
          user_id: userId,
          email: event.data.email,
          username: event.data.username,
          created_at: new Date().toISOString()
        }
      };
    }
  }
});
```

### Step 3: Put It All Together

Let's create a complete example that shows how to use your event handler in `examples/complete-user-service.ts`:

```typescript
import { createArvoEventFactory } from 'arvo-core';
import { userRegistrationContract } from '../contracts/user-registration';
import { userRegistrationHandlerFactory } from '../handlers/user-registration-handler';
import { UserDatabase } from '../services/database';

async function runUserRegistrationDemo() {
    // Set up dependencies
    const database = new UserDatabase();
    
    // Create the handler instance with dependencies
    const handler = userRegistrationHandlerFactory({ database });
    
    // Create an event factory for testing
    const eventFactory = createArvoEventFactory(userRegistrationContract.version('1.0.0'));

    console.log('=== User Registration Service Demo ===\n');

    // Test 1: Successful registration
    console.log('📝 Test 1: Successful user registration');
    const successEvent = eventFactory.accepts({
        source: 'com.web.frontend',
        data: {
            email: 'john.doe@example.com',
            username: 'johndoe',
            password: 'securepassword123'
        }
    });

    const successResult = await handler.execute(successEvent);
    console.log(`✅ Result: ${successResult.events[0].type}`);
    console.log(`📋 Data:`, successResult.events[0].data);
    console.log('');

    // Test 2: Duplicate email
    console.log('📝 Test 2: Duplicate email registration');
    const duplicateEmailEvent = eventFactory.accepts({
        source: 'com.web.frontend',
        data: {
            email: 'john.doe@example.com', // Same email as above
            username: 'anotherjohn',
            password: 'anotherpassword123'
        }
    });

    const duplicateResult = await handler.execute(duplicateEmailEvent);
    console.log(`❌ Result: ${duplicateResult.events[0].type}`);
    console.log(`📋 Data:`, duplicateResult.events[0].data);
    console.log('');

    // Test 3: Duplicate username
    console.log('📝 Test 3: Duplicate username registration');
    const duplicateUsernameEvent = eventFactory.accepts({
        source: 'com.web.frontend',
        data: {
            email: 'jane.doe@example.com',
            username: 'johndoe', // Same username as first test
            password: 'janepassword123'
        }
    });

    const duplicateUsernameResult = await handler.execute(duplicateUsernameEvent);
    console.log(`❌ Result: ${duplicateUsernameResult.events[0].type}`);
    console.log(`📋 Data:`, duplicateUsernameResult.events[0].data);
    console.log('');

    // Test 4: Runtime error handling
    console.log('📝 Test 4: Runtime error handling');
    try {
        // Create an event with invalid data to trigger validation
        const invalidEvent = eventFactory.accepts({
            source: 'com.web.frontend',
            data: {
                email: 'not-an-email', // Invalid email
                username: 'ab', // Too short
                password: '123' // Too short
            }
        });
        
        await handler.execute(invalidEvent);
    } catch (error) {
        console.log(`💥 Caught validation error: ${error.message}`);
    }
}

// Run the demo
runUserRegistrationDemo().catch(console.error);
```

### Step 4: Run Your Service

```bash
npx tsx examples/complete-user-service.ts
```

You should see output showing successful registrations, business logic errors (like duplicate emails), and validation errors being handled appropriately.

## Advanced Patterns

### Handling Multiple Versions

As your service evolves, you'll need to support multiple contract versions:

```typescript
const handlerFactory: EventHandlerFactory<HandlerDependencies> = ({ database }) => 
    createArvoEventHandler({
        contract: userRegistrationContract,
        executionunits: 0.001,
        handler: {
            '1.0.0': async ({ event, span }) => {
                // Original implementation
                logToSpan({ level: 'INFO', message: 'Processing v1.0.0 registration' }, span);
                // ... implementation
            },
            '2.0.0': async ({ event, span }) => {
                // Enhanced implementation with new features
                logToSpan({ level: 'INFO', message: 'Processing v2.0.0 registration with enhanced validation' }, span);
                // ... enhanced implementation
            }
        }
    });
```

### Error Handling Strategy

ArvoEventHandler distinguishes between different types of issues:

```typescript
// Business logic errors - return as events
return {
    type: 'evt.user.registration.failed',
    data: { reason: 'Email exists', error_code: 'EMAIL_EXISTS' }
};

// Runtime errors - throw and let the handler convert to system errors
throw new Error('Database connection failed');

// Contract violations - these bubble up as ConfigViolation or ContractViolation
// These indicate serious system issues that need immediate attention
```

### Testing Your Handler

Testing handlers is straightforward thanks to the factory pattern:

```typescript
// test/user-registration-handler.test.ts
import { createArvoEventFactory } from 'arvo-core';
import { userRegistrationHandlerFactory } from '../handlers/user-registration-handler';
import { UserDatabase } from '../services/database';

describe('User Registration Handler', () => {
    let database: UserDatabase;
    let handler: ReturnType<typeof userRegistrationHandlerFactory>;
    let eventFactory: ReturnType<typeof createArvoEventFactory>;

    beforeEach(() => {
        database = new UserDatabase();
        handler = userRegistrationHandlerFactory({ database });
        eventFactory = createArvoEventFactory(userRegistrationContract.version('1.0.0'));
    });

    it('should successfully register a new user', async () => {
        const event = eventFactory.accepts({
            source: 'test',
            data: {
                email: 'test@example.com',
                username: 'testuser',
                password: 'password123'
            }
        });

        const result = await handler.execute(event);

        expect(result.events).toHaveLength(1);
        expect(result.events[0].type).toBe('evt.user.registered');
        expect(result.events[0].data.user_id).toBeDefined();
    });

    it('should reject duplicate emails', async () => {
        // Create first user
        await database.createUser('test@example.com', 'user1', 'pass');

        const event = eventFactory.accepts({
            source: 'test',
            data: {
                email: 'test@example.com',
                username: 'user2',
                password: 'password123'
            }
        });

        const result = await handler.execute(event);

        expect(result.events[0].type).toBe('evt.user.registration.failed');
        expect(result.events[0].data.error_code).toBe('EMAIL_EXISTS');
    });
});
```

## What's Next?

Now that you understand the basics of ArvoEventHandler, you can explore:

1. **[Contract Evolution](#managing-service-evolution-through-contracts)** - Learn how to evolve your handlers while maintaining backward compatibility
2. **[Multi-Domain Broadcasting](#multi-domain-event-broadcasting)** - Route events to different processing contexts
3. **[Error Handling Strategies](#error-handling)** - Master the different types of errors and how to handle them
4. **[Testing Patterns](#testing-event-handlers-in-arvo)** - Build comprehensive test suites for your handlers
5. **[Orchestration](./ArvoOrchestrator.md)** - Coordinate complex workflows across multiple services

The patterns you've learned here form the foundation for building reliable, evolvable event-driven systems with Arvo.

## Principles of Reliable Event-Driven Systems

Arvo is engineered as an evolutionary event-driven architecture that strives to create systems that are reliable, adaptable, and transparent. In event-driven systems, the majority of complexity stems from inter-service communication. Arvo manages these complexities by enforcing several fundamental principles:

1. All interservice communication is async and event driven
2. All events in the system are `ArvoEvent`, which extends `CloudEvent` with additional routing and opentelemetry extensions
3. All interservice communications are bound and validated by a contract system, with services coupling to contracts rather than directly to other services and channels

Service contracts are not novel; various specifications exist for defining them, such as OpenAPI, AsyncAPI, and Protocol Buffers. However, in practice, these specifications often devolve into producer-driven documentation or become outdated unless development teams maintain extremely rigorous standards. This degradation occurs because software systems are living entities that evolve over time, managed by diverse teams with varying priorities and perspectives.

In an ideal scenario, these contracts serve as crucial tools for creating evolvable and reliable systems. When the entire system recognizes service contracts and consistently upholds them, inter-service communication becomes dependable. Service developers gain the freedom to modify their implementations as needed, provided they maintain their contractual obligations. Furthermore, when properly implemented and thoughtfully designed, these contracts create robust pathways for system evolution while preserving backward compatibility. However, practical limitations in both specifications and ecosystems often prevent achieving these ideal outcomes.

## Contract-First Development in TypeScript

Arvo draws inspiration from established service contract practices and foundational software engineering theories, including Meyer's Design by Contract and Fowler's Tolerant Reader pattern, to create a more robust and naturally enforceable contract system. At its core, Arvo champions a contract-first development approach, implementing contracts as TypeScript objects that provide comprehensive type safety. The framework's `ArvoEventHandler` must be paired with an `ArvoContract` to create service implementations, ensuring consistent contract enforcement throughout the development lifecycle.

> While this approach makes Arvo specifically TypeScript-oriented, the underlying principles can be implemented in any programming language. Arvo considers this TypeScript specialisation an acceptable trade-off for building evolutionary architectures, particularly given TypeScript's versatility in web development at all levels. The strong typing system and modern development features of TypeScript enable Arvo to provide a more cohesive and maintainable contract-based development experience.

## Implementing Your First Arvo Service

Building services with ArvoEventHandler follows a thoughtful, contract-first approach that ensures type safety and maintainable code. The process begins with contract definition and moves through to implementation, with TypeScript's type system helping ensure correctness at every step.

Let's explore a practical example of creating a user service. We'll start by importing the necessary components and defining our contract. The contract will specify what our service accepts and what it can emit:

```typescript
import { createArvoContract, type ArvoEvent } from 'arvo-core';
import { createArvoEventHandler } from 'arvo-event-handler';
import z from 'zod';

// Our contract defines the service interface
const userCreateContract = createArvoContract({
    uri: "#/sample/user/create",
    type: "com.create.user",
    versions: {
        "1.0.0": {
            accepts: z.object({
                name: z.string(),
                age: z.number(),
            }),
            emits: {
                "evt.create.user.success": z.object({
                    created: z.boolean()
                })
            }
        },
    }
});
```

With our contract in place, we can define the core business logic of our service. By separating this logic from the event handling, we maintain cleaner code organization and make our service easier to test:

```typescript
const createUser = (name: string, age: number): boolean => {
    // Implementation of user creation logic
    return true; // Simplified for example
};
```

> While this example demonstrates a clean separation of concerns by extracting the business logic into a standalone function, real-world service development often follows a different path. In practice, it's often more effective to start by implementing the functionality directly within the handler function. This approach allows you to fully understand the service's requirements and usage patterns in context. As the service matures and patterns emerge through actual use, you can then thoughtfully extract and abstract common functionalities. This evolution-based approach helps prevent premature abstractions and ensures that when you do create separate functions, they genuinely serve the service's needs and reflect real usage patterns rather than speculative design.

Now we can create our event handler, binding it to our contract and implementing the business logic for each version. The handler maps incoming events to their appropriate version-specific implementations:

```typescript
const handlerFactory: EventHandlerFactory = () => createArvoEventHandler({
    contract: userCreateContract,
    executionunits: 1, // Business-defined execution cost
    handler: {
        // Version-specific implementation
        '1.0.0': async ({event}) => {
            const userCreated = createUser(
                event.data.name,
                event.data.age
            );
            return {
                type: 'evt.create.user.success',
                data: { created: userCreated },
            };
        },
    }
});

const handler = handlerFactory()
```

Notice how the handler's version key ('1.0.0') corresponds to the contract version. When an event arrives with a matching `dataschema` version, the handler routes it to the appropriate implementation. This versioning system ensures that each implementation adheres strictly to its contract version, allowing the service to evolve while maintaining backward compatibility. Developers can modify the implementation details freely as long as they maintain the contract's requirements.

### The factory pattern - `EventHandlerFactory`

The `EventHandlerFactory` is a core type in the `arvo-event-handler` package that provides the foundation for creating event handlers. Rather than directly using `createArvoEventHandler`, services should be built using this factory type. It enforces a consistent pattern for dependency injection by defining an explicit contract for what a handler requires to function. When a developer implements the `EventHandlerFactory` type, they're creating a blueprint that specifies both the handler's dependencies and its implementation. This type-driven approach ensures that all necessary dependencies are properly declared and managed through TypeScript's type system, making the relationships between handlers and their required resources clear and maintainable.

```typescript
import { type EventHandlerFactory, createArvoEventHandler } from 'arvo-event-handler';

interface HandlerDependencies {
    database: DatabaseClient;
    config: {
        maxRetries: number;
        timeout: number;
    };
    logger: Logger;
}

const userCreateHandlerFactory: EventHandlerFactory<HandlerDependencies> = ({
    database,
    config,
    logger
}) => createArvoEventHandler({
    contract: userCreateContract,
    executionunits: 1,
    handler: {
        '1.0.0': async ({event, span}) => {
            // Dependencies are available in scope
            logger.info('Processing user creation');
            const user = await database.createUser(event.data);
            return {
                type: 'evt.create.user.success',
                data: { created: true }
            };
        }
    }
});
```

While the factory pattern may initially appear to introduce additional boilerplate compared to direct handler creation, this structure serves a crucial architectural purpose. Even for handlers without dependencies, using `EventHandlerFactory`establishes a consistent pattern across all services and enables future evolution. Services that start simple often grow to require dependencies as business needs evolve - using the factory pattern from the start makes this transition seamless without requiring structural changes to the codebase. The factory pattern also maintains uniformity in how services are constructed and tested across a system, making codebases more maintainable and easier to understand for development teams.
### Anatomy of a handler function

When implementing a `ArvoEventHandler`, each version of your service gets its own dedicated function for processing events. The handler function is always an asynchronous function that receives a rich context object containing three key pieces of information: 

- The `event` is a pre-validated input that has been rigorously checked against the contract's schema before reaching the handler. This validation ensures that by the time the handler receives the event, its structure is guaranteed to be correct. TypeScript integration provides additional safety: your IDE will offer intelligent autocomplete for data fields, and the TypeScript compiler will immediately highlight any type mismatches or structural errors during development.
- The `source` parameter represents the service's identity, typically matching the contract's type. 
- The `span` is an OpenTelemetry tracing object that enables sophisticated observability. It allows developers to add rich metadata and logging information throughout the service's execution trace, providing deep insights into the system's behaviour and performance.

Here's how this data from the context come to life in a real event handler implementation:

```typescript
import { logToSpan } from 'arvo-core'

const handler = createArvoEventHandler({
    contract: userCreateContract,
    executionunits: 1, // Business-defined execution cost
    handler: {
        // Version-specific implementation
        '1.0.0': async ({event, source, span}) => {
            // The types are:
            // - event: ArvoEvent
            // - source: string
            // - span: Span <from opentelemetry>
            //
            // Adding some more attributes for logging
            span.setAttribute('sample-service-name', source)

            // The function automatically figures of the appropriate span
            logToSpan({
                level: 'INFO',
                message: "Service started"
            })

            const userCreated = createUser(
                event.data.name,
                event.data.age
            );

            // The target span to log event to can explicitly be defined
            logToSpan({
                level: 'INFO',
                message: "Service started"
            }, span)
            
            span.setAttribute('sample-execution-cost', 10)

            return {
                type: 'evt.create.user.success',
                data: { created: userCreated },
            };
        },
    }
});
```

This example demonstrates an Arvo event handler for user creation that leverages OpenTelemetry tracing. It adds custom attributes to the span (like service name and execution cost), logs informational messages about the service's execution, and performs the core user creation logic. The handler uses both implicit and explicit logging with `logToSpan`, showcasing how developers can easily inject observability into their event processing without disrupting the main business logic.

### Logging Mechanism

Arvo introduces `logToSpan`, a utility designed to integrate logging directly into OpenTelemetry tracing spans. This function enables developers to add structured **log events** throughout event processing while maintaining clean, uncluttered business logic.

With `logToSpan`, logging becomes a seamless part of observability. Developers can:
- Log messages with various severity levels
- Attach contextual information
- Precisely correlate logs with specific traces and spans

The utility abstracts away the complexities of span management. Whether you want to use the current active span or explicitly specify a target span, `logToSpan` handles the details of log attachment automatically. This approach provides a consistent, developer-friendly method for capturing runtime information across distributed event-driven systems.

By integrating logging directly into the tracing mechanism, Arvo ensures that every log event is not just a message, but a rich, traceable piece of system log. Developers can focus on their core logic, knowing that observability is built-in and effortless.

## Managing Service Evolution Through Contracts

The `ArvoEventHandler` takes a unique approach to contract versioning, treating each version as a completely independent entity, both functionally and semantically. This design isn't just a technical choice - it reflects Arvo's fundamental philosophy about how services should evolve in distributed systems.

When an `ArvoEventHandler` binds to a contract, it enforces a strict requirement: every version defined in the `ArvoContract` must have a corresponding implementation in the handler. While this might initially seem to promote code duplication, it serves a deeper purpose. This approach ensures complete and reliable backward compatibility while giving developers the freedom to implement version-specific business logic and manage their deprecation strategies according to business needs.

Let's explore this through a practical example. Imagine a scenario where a new consumer needs to provide a date of birth instead of age when creating users. This requirement may leads us to create a new contract version:

```typescript
import { createArvoContract, type ArvoEvent } from 'arvo-core';
import { createArvoEventHandler } from 'arvo-event-handler';
import z from 'zod';

const userCreateContract = createArvoContract({
    uri: "#/sample/user/create",
    type: "com.create.user",
    versions: {
        "1.0.0": {
            accepts: z.object({
                name: z.string(),
                age: z.number(),
            }),
            emits: {
                "evt.create.user.success": z.object({
                    created: z.boolean()
                })
            }
        },
        "2.0.0": {
            accepts: z.object({
                name: z.string(),
                dob: z.string(), // Changed from age to date of birth
            }),
            emits: {
                "evt.create.user.success": z.object({
                    created: z.boolean()
                })
            }
        }
    }
});
```

> **Interesting Point**: According to the ArvoContract documentation, introducing a new field format (changing from age to dob) could be handled through a union type in the same version since it increases permissiveness while preserving existing functionality. While this would result in less code, creating a new version offers cleaner separation of concerns and easier tracking of consumer requirements. Consider your specific needs - union types for simpler changes and gradual adoption, new versions for clearer boundaries and independent evolution paths. Both approaches are valid within Arvo's contract evolution principles; choose based on your maintenance strategy and consumer needs.

Rather than duplicating all our business logic, we can maintain our core functionality while adding version-specific transformations. Notice how the `createUser` function remains unchanged while we add a new helper function to handle the date of birth conversion:

```typescript
const createUser = (name: string, age: number): boolean => {
    // Core business logic remains stable
    return true;
};

const calculateAge = (dob: string): number => {
    const birthDate = new Date(dob);
    const today = new Date();
    return today.getFullYear() - birthDate.getFullYear();
};

const handlerFactory: EventHandlerFactory = () => createArvoEventHandler({
    contract: userCreateContract,
    executionunits: 1,
    handler: {
        '1.0.0': async ({event}) => {
            const userCreated = createUser(
                event.data.name,
                event.data.age
            );
            return {
                type: 'evt.create.user.success',
                data: { created: userCreated }
            };
        },
        '2.0.0': async ({event}) => {
            const age = calculateAge(event.data.dob);
            const userCreated = createUser(
                event.data.name,
                age
            );
            return {
                type: 'evt.create.user.success',
                data: { created: userCreated },
                executionunits: 2, // A override cost specific to this version 
            };
        }
    }
});

const handler = handlerFactory()
```

This pattern demonstrates how Arvo promotes evolution while maintaining reliability. The isolation between handler functions for different versions is intentional - it allows each version to evolve independently while preserving the integrity of the service contract. This approach enables teams to add new consumers with different requirements while maintaining existing functionality, and it provides the flexibility to implement sunset strategies based on business needs rather than technical limitations.

The slight increase in code volume is a conscious trade-off, chosen to prioritise system reliability and evolution over code conciseness. This approach may proven particularly valuable in large-scale systems where the cost of breaking changes far outweighs the cost of maintaining version-specific handlers.

## Event Processing and Execution Flow

To demonstrate how this all works together, let's look at a simple execution flow that shows how events flow through the system - from creation through processing to response:

```typescript
async function main() {
    const inputEvent: ArvoEvent = createArvoEventFactory(
        userCreateContract.version('1.0.0')
    ).accepts({
        subject: "some-subject",
        source: "com.test.test",
        data: {
            name: "John Doe",
            age: 65
        }
    })
    
    const result: ArvoEvent[] = await handler.execute(
         inputEvent        
    )
}
main().catch(console.error)
```

### What Happens Here?

Let's break down this execution flow to understand how Arvo processes events through the system. The execution begins with event creation through the `createArvoEventFactory`. This factory, initialized with version '1.0.0' of our contract, ensures all event creation strictly follows the version's schema specifications.

The `accepts` method then generates an event matching our contract's input requirements, carefully structuring the data with `name` and `age` fields to align with our contract's accept schema. This ensures type safety from the very beginning of our event's lifecycle.

The core processing occurs when we call `handler.execute`. The handler first validates the incoming event against the contract specifications. Upon successful validation, it routes the event to the correct version-specific implementation by examining the event's `dataschema`. This implementation then processes the event according to its business logic and produces response events. Before these response events leave the handler, they undergo validation against the contract's emit schema, ensuring they meet all specified requirements.

At the end of this flow, we receive our array of response events stored in `result`. Each event in this array has been fully validated and is guaranteed to conform to our contract's specifications, maintaining the integrity of our service's communication interface.

### Understanding the Handler Interface

All event handlers in Arvo follow a consistent signature: `ArvoEvent => Promise<{ events:ArvoEvent[] }>`. This unified interface offers several key advantages:

This simple yet powerful pattern means every handler takes an ArvoEvent as input and returns a Promise that resolves to an array of ArvoEvents. The promise wrapper enables asynchronous processing, while returning an array of events allows handlers to trigger multiple consequent actions when needed. This uniformity creates a predictable flow of events through the system, making it easier to reason about service behavior and compose complex workflows.

Whether you're building a simple service like our user creation example or orchestrating complex business processes, this consistent interface ensures that all services speak the same language and can be composed reliably. The handler's contract validation ensures that both incoming and outgoing events adhere to their specified schemas, maintaining type safety throughout the event chain.

## Error Handling

Error handling forms a critical foundation for building reliable event-driven systems. `ArvoEventHandler` implements a sophisticated error handling strategy that recognises different categories of issues and provides appropriate mechanisms for dealing with each.

At its core, Arvo distinguishes between two fundamental types of errors: system errors that occur during normal operation and can potentially be recovered from, and violations that indicate serious structural or configuration issues requiring immediate attention.

> When implementing handler functions, you should throw errors naturally and let them propagate. The `ArvoEventHandler`will catch these errors and automatically transform them into appropriate system error events. The following sections explain what happens when you call `handler.execute(event)` and how different types of errors are processed.

### System Error Events

System errors represent operational issues that occur during the normal execution of a service. These might include temporary network failures, resource constraints, or other transient conditions that could resolve with time or retry attempts. When an uncaught error occurs within a handler function, Arvo automatically converts it into a standardised system error event.

The system error events follow a consistent format defined by the `ArvoContract`, with the type `sys.<contract-type>.error`. This standardisation ensures that error handling remains consistent across the system and enables automated processing of error conditions. For example, in our user creation service, a system error event might look like this:

```typescript
import { type ArvoErrorType, createArvoError, createArvoEvent } from 'arvo-core'

const sampleErrorEvent = createArvoEvent({
    ...rest,
    type: 'sys.com.user.create.error',
    data: createArvoError(
        new Error("Some random error")
    ), // satisfies ArvoErrorType
})

/**
 * The event will be...
 * ArvoEvent<ArvoErrorType, {}, `sys.com.user.create.error`>
 * = {
 *   type: "sys.com.user.create.error",
 *   data: {
 *      errorName: string,
 *      errorMessage: string,
 *      errorStack: string | null
 *   },
 *   ...rest
 * }
 */
```

> While the example above shows the error event structure, developers should never create these error events directly. The `ArvoEventHandler` automatically generates and emits system errors when uncaught exceptions occur during execution. This ensures consistent error handling across the system.

### Violations

While system errors represent operational issues, violations indicate fundamental problems with how the system is configured or being used. These are serious issues that could compromise system integrity if allowed to continue. Unlike system errors that are returned as events, violations are thrown as exceptions that must be handled explicitly.

Arvo defines three distinct types of violations, each serving a specific purpose in maintaining system integrity:

#### ConfigViolation

The `ConfigViolation` indicates fundamental mismatches between events and their handlers. This might occur when events are routed to the wrong service (like sending a payment event to a user service) or when events specify nonexistent contract versions. These violations help catch system configuration errors before they can cause cascading failures.

#### ContractViolation

The `ContractViolation` occurs when events fail to meet their contractual obligations. This happens when incoming or outgoing events fail schema validation, when event URIs don't match their handler contracts, or when data types don't align with schema requirements. These violations typically indicate implementation bugs or data corruption issues that require developer attention.

#### ExecutionViolation

> **WARNING!** Do not use it for normal business failures (leverage system errors mechanism), validation failures (leverage `ContractViolation`), routing issues (leverage `ConfigViolation`), or temporary failures that could succeed on retry.

`ExecutionViolation` is a developer-controlled mechanism for handling extraordinary cases. They serves as an infrastructure-level signal rather than an error condition. Its primary purpose is to act as a circuit breaker mechanism, indicating that message processing should cease and the event should be moved to a dead letter queue for investigation. This violation type is particularly useful in preventing harmful processing loops or handling unrecoverable semantic errors. 

Handling violations in practice:

```typescript
import type { ConfigViolation, ContractViolation, ExecutionViolation } from 'arvo-event-handler';

try {
    const result = await handler.execute(inputEvent);
    // Process successful result
} catch (error) {
    if ((e as ConfigViolation)?.name === 'ViolationError<Config>') {
        // Do something...
    }
    if ((e as ContractViolation)?.name === 'ViolationError<Contract>') {
        // Do something...
    }
    if ((e as ExecutionViolation)?.name === 'ViolationError<Execution>') {
        // Do something...
    }
}
```

With this structured approach to error handling, Arvo attempts to enables developers to build robust, self-healing systems while ensuring that serious issues receive immediate attention. 

## A Note on Contract Validation Performance

Contract validation is an integral part of the event handler execution process in Arvo, occurring for both incoming and outgoing events against the `ArvoContract`. While this might initially raise performance concerns, several architectural decisions help minimise any potential overhead.

At the core of Arvo's validation system lies the Zod package, a widely adopted TypeScript schema validation library. Zod not only handles validation but also manages default value population in a single pass, eliminating the need for separate processing steps. This integration provides a robust foundation for type safety while maintaining efficient execution.

The centralised validation approach through `ArvoContract` eliminates the need for individual validation logic in each handler implementation. This not only reduces code redundancy but also ensures consistency across services. In the context of distributed systems, the validation overhead is minimal compared to typical network latency and business logic execution times. Since validation is a necessary component of most applications, integrating it at the contract level provides comprehensive type safety without significant performance impact.

While Zod can face performance challenges when validating deeply nested structures, large datasets, or complex types like unions and arrays, these limitations are offset by its comprehensive feature set and mature API. To address potential IDE performance impacts in large systems with numerous contracts, Arvo recommends implementing contracts in separate packages distributed through monorepo structures or package registries. This approach leverages TypeScript's compilation process, generating declaration files that optimise IDE performance through transpiled type declarations.

It's worth noting that in typical event-driven architectures, these performance considerations rarely become bottlenecks, as network latency and database operations usually dominate the performance profile. For cases requiring exceptional performance, developers can implement custom handlers. Arvo's design philosophy prioritises reasonable performance for typical use cases rather than extreme computational efficiency. 

> In Arvo's event-driven architecture, events typically serve as commands and responses between services. Since these events represent service interactions rather than data storage or transfer mechanisms, large event payloads may indicate a violation of single responsibility principles - where an event is trying to do too much or carry too much information. This could make the system harder to maintain and evolve over time. For scenarios involving large datasets, consider whether the data transfer could be better handled through other mechanisms while keeping the event focused on the service interaction itself.

## Multi-Domain Event Broadcasting

> **Caution:** Don't use domained contracts unless it is fully intentional. Using domained contracts causes implicit domain assignment which can be hard to track and confusing. For 99% of the cases you dont need domained contracts.

The ArvoEventHandler supports sophisticated multi-domain event distribution through array-based domain specification. This powerful feature allows events to be broadcast across multiple processing contexts simultaneously.

### Understanding Domains

In Arvo, domains represent different processing contexts or routing namespaces for events. They enable sophisticated event distribution patterns where a single handler response can create multiple events for different processing pipelines.

### Domain Assignment Rules

When returning events from a handler, you can specify domains using the `domain` field:

1. **Array Processing**: Each element in the `domain` array creates a separate ArvoEvent instance
2. **`undefined` in Array Resolution**: `undefined` elements resolve to: `triggeringEvent.domain ?? handler.contract.domain ?? null`
3. **`null` in Array Resolution**: `null` elements resolve to events which `domain: null`
3. **Automatic Deduplication**: Duplicate domains are automatically removed to prevent redundant events
4. **Default Behavior**: Omitting the `domain` field (or setting to `undefined`) defaults to `[null]` (single event, no domain)

### Domain broadcasting pattern

Let's look at extending the getting start example to use the domain broadcasting

#### Step 1: Update Your Event Handler

We'll extend the handler to demonstrate domain broadcasting capabilities in `handlers/user-registration-handler.ts`:

```typescript
import { createArvoEventHandler, type EventHandlerFactory } from 'arvo-event-handler';
import { logToSpan } from 'arvo-core';
import { userRegistrationContract } from '../contracts/user-registration';
import type { UserDatabase } from '../services/database';

type HandlerDependencies = {
    database: UserDatabase;
}

// Create the handler factory - this is the recommended pattern
export const userRegistrationHandlerFactory: EventHandlerFactory<HandlerDependencies> = ({
    database
}) => createArvoEventHandler({
  contract: userRegistrationContract,
  executionunits: 0.001, // Cost per execution (business-defined)
  handler: {
    '1.0.0': async ({ event, source, span, domain }) => {
      logToSpan({
        level: 'INFO',
        message: `Processing user registration for ${event.data.email}`
      }, span);

      // Log domain information for observability
      if (domain.event) {
        logToSpan({
          level: 'INFO',
          message: `Event received from domain: ${domain.event}`
        }, span);
      }

      // Check if email already exists
      if (await database.emailExists(event.data.email)) {
        logToSpan({
          level: 'WARN',
          message: `Registration failed: Email ${event.data.email} already exists`
        }, span);

        return {
          type: 'evt.user.registration.failed',
          data: {
            reason: 'Email address already exists in the system',
            error_code: 'EMAIL_EXISTS'
          },
          // Broadcast error to multiple domains for different processing contexts
          // along with the default 'null' no-domain event.
          domain: ['audit.failures', 'analytics.errors', null]
        };
      }

      // Check if username already exists
      if (await database.usernameExists(event.data.username)) {
        logToSpan({
          level: 'WARN',
          message: `Registration failed: Username ${event.data.username} already taken`
        }, span);

        return {
          type: 'evt.user.registration.failed',
          data: {
            reason: 'Username already taken',
            error_code: 'USERNAME_TAKEN'
          },
          // Send failure to audit
          domain: ['audit.failures']
        };
      }

      // Create the user
      const userId = await database.createUser(
        event.data.email,
        event.data.username,
        event.data.password
      );

      logToSpan({
        level: 'INFO',
        message: `User ${userId} created successfully`
      }, span);

      // Determine if this is a premium user based on email domain
      const isPremiumUser = event.data.email.endsWith('@premium.com');

      // Return success event with sophisticated domain broadcasting
      return {
        type: 'evt.user.registered',
        data: {
          user_id: userId,
          email: event.data.email,
          username: event.data.username,
          created_at: new Date().toISOString()
        },
        // Multi-domain broadcasting based on business logic
        domain: isPremiumUser ? 
          [
            'analytics.users',      // All user analytics
            'crm.premium',         // Premium user CRM
            'marketing.vip',       // VIP marketing campaigns
            null                   // Standard processing pipeline
          ] : 
          [
            'analytics.users',     // All user analytics
            undefined,             // Inherit from event or handler domain
            null                   // Standard processing pipeline
          ]
      };
    }
  }
});
```

#### Step 2: Domain Broadcasting Examples

Let's also create a dedicated example that shows different domain broadcasting patterns in `examples/domain-broadcasting-demo.ts`:

```typescript

import { createArvoEventFactory } from 'arvo-core';
import { userRegistrationContract } from '../contracts/user-registration';
import { userRegistrationHandlerFactory } from '../handlers/user-registration-handler';
import { UserDatabase } from '../services/database';

async function runDomainBroadcastingDemo() {
    const database = new UserDatabase();
    const handler = userRegistrationHandlerFactory({ database });
    const eventFactory = createArvoEventFactory(userRegistrationContract.version('1.0.0'));

    console.log('=== Domain Broadcasting Demo ===\n');

    // Test 1: Premium user registration (multiple domains)
    console.log('📝 Test 1: Premium user registration');
    const premiumEvent = eventFactory.accepts({
        source: 'com.web.frontend',
        data: {
            email: 'john.doe@premium.com',
            username: 'johndoe',
            password: 'securepassword123'
        }
    });

    const premiumResult = await handler.execute(premiumEvent);
    console.log(`✅ Generated ${premiumResult.events.length} events for premium user:`);
    premiumResult.events.forEach((event, index) => {
        console.log(`   Event ${index + 1}: type=${event.type}, domain=${event.domain || 'null'}`);
    });
    console.log('');

    // Test 2: Regular user registration (different domain pattern)
    console.log('📝 Test 2: Regular user registration');
    const regularEvent = eventFactory.accepts({
        source: 'com.web.frontend',
        data: {
            email: 'jane.smith@gmail.com',
            username: 'janesmith',
            password: 'anotherpassword123'
        }
    });

    const regularResult = await handler.execute(regularEvent);
    console.log(`✅ Generated ${regularResult.events.length} events for regular user:`);
    regularResult.events.forEach((event, index) => {
        console.log(`   Event ${index + 1}: type=${event.type}, domain=${event.domain || 'null'}`);
    });
    console.log('');

    // Test 3: Email conflict (error broadcasting)
    console.log('📝 Test 3: Email conflict with domain broadcasting');
    const conflictEvent = eventFactory.accepts({
        source: 'com.web.frontend',
        data: {
            email: 'john.doe@premium.com', // Same as first test
            username: 'anotherjohn',
            password: 'conflictpassword123'
        }
    });

    const conflictResult = await handler.execute(conflictEvent);
    console.log(`❌ Generated ${conflictResult.events.length} error events:`);
    conflictResult.events.forEach((event, index) => {
        console.log(`   Event ${index + 1}: type=${event.type}, domain=${event.domain || 'null'}`);
        console.log(`   Error: ${event.data.error_code} - ${event.data.reason}`);
    });
    console.log('');

    // Test 4: Username conflict (single domain error)
    console.log('📝 Test 4: Username conflict with single domain');
    const usernameConflictEvent = eventFactory.accepts({
        source: 'com.web.frontend',
        data: {
            email: 'unique.email@example.com',
            username: 'johndoe', // Same as first test
            password: 'uniquepassword123'
        }
    });

    const usernameConflictResult = await handler.execute(usernameConflictEvent);
    console.log(`❌ Generated ${usernameConflictResult.events.length} error event:`);
    usernameConflictResult.events.forEach((event, index) => {
        console.log(`   Event ${index + 1}: type=${event.type}, domain=${event.domain || 'null'}`);
        console.log(`   Error: ${event.data.error_code} - ${event.data.reason}`);
    });
}

// Run the demo
runDomainBroadcastingDemo().catch(console.error);
```

#### Understanding Domain Broadcasting Patterns

When you run this example (`npx tsx examples/domain-broadcasting-demo.ts`), you'll see different domain broadcasting patterns in action:

**Premium User Success Event** creates 4 events:
- `domain: 'analytics.users'` - For user analytics processing
- `domain: 'crm.premium'` - For premium customer relationship management
- `domain: 'marketing.vip'` - For VIP marketing campaigns
- `domain: null` - For standard processing pipeline

**Regular User Success Event** creates 3 events:
- `domain: 'analytics.users'` - For user analytics processing
- `domain: null` - From `undefined` resolution (since no event or handler domain)
- `domain: null` - Explicit null domain (deduplication removes duplicate)

**Email Conflict Error** creates 3 events:
- `domain: 'audit.failures'` - For failure auditing
- `domain: 'analytics.errors'` - For error analytics
- `domain: null` - For standard error processing

**Username Conflict Error** creates 1 event:
- `domain: 'audit.failures'` - Single targeted domain for audit

This demonstrates how domain broadcasting enables sophisticated event routing based on business logic, user types, and error conditions while maintaining clean separation of processing contexts.

### Error Broadcasting

System errors are automatically broadcast to all relevant processing contexts:
- Source event domain (`event.domain`)
- Handler contract domain (`handler.contract.domain`)
- No-domain context (`null`)

Duplicates are automatically removed, so if `event.domain === handler.contract.domain`, only two error events are created instead of three.

## Event Handler Scaling

The `ArvoEventHandler` execution model implements a functional architecture that inherently supports scalability in distributed systems. At its core, each handler is a pure function with the signature `ArvoEvent => Promise<{ events:ArvoEvent[] }>`, encapsulating all processing logic within a self-contained unit. This fundamental design choice enables handlers to operate independently, receiving all required context through event parameters and maintaining consistent behavior across different deployment environments.

The contract-based validation system ensures behavioral consistency regardless of where handlers execute, while the absence of shared state eliminates traditional scaling bottlenecks. This architectural approach provides natural support for both horizontal scaling through distribution across multiple compute nodes, and vertical scaling through resource allocation. The handlers maintain their operational integrity whether deployed in traditional cluster environments, container orchestration platforms, or serverless infrastructures.

This architecture allows development teams to concentrate on implementing business logic without being constrained by scaling considerations. Handlers written and tested in development environments can transition directly to handling production workloads across distributed instances. The event-driven communication model enables flexible deployment strategies - systems can begin as modular monolithic applications and evolve into distributed architectures by introducing message brokers. Service communication remains event-based throughout, with the broker implementation ranging from an in-memory array for simple scenarios to external message brokers for production deployments. Event coordination between services can be managed through either choreography patterns or using the ArvoOrchestrator implementation provided by the `arvo-xstate` package, offering flexibility in system design and evolution.

## Testing Event Handlers in Arvo

Testing event handlers is a critical part of building reliable event-driven systems with Arvo. It provides several features that make testing handlers straightforward and effective.

### The `EventHandlerFactory` Pattern

The `EventHandlerFactory` is a function that creates an event handler. It takes the handler's dependencies as parameters, allowing them to be easily mocked or substituted in tests. This is a form of dependency injection.

```typescript
interface HandlerDependencies {
  database: DatabaseClient;
  logger: Logger;
}

const userHandlerFactory: EventHandlerFactory<HandlerDependencies> = ({
  database,
  logger
}) => createArvoEventHandler({
  // Handler configuration...
});
```

In tests, you can provide mocked versions of the dependencies:

```typescript
const mockedDatabase = createMockDatabase();
const mockedLogger = createMockLogger();

const handler = userHandlerFactory({
  database: mockedDatabase, 
  logger: mockedLogger
});
```

This allows you to test the handler in isolation, controlling its dependencies and asserting on how it interacts with them.

### Consistent Handler Signature

All Arvo event handlers have the same basic signature:

```
ArvoEvent => Promise<{ events:ArvoEvent[] }>
```

They take an `ArvoEvent` as input and return a `Promise` that resolves to an array of `ArvoEvent`s. This consistency makes it easy to write tests for any handler.

A typical test would:
1. Create an input `ArvoEvent`
2. Pass it to the handler's `execute` method
3. Assert on the output events

```typescript
it('should create a user successfully', async () => {
  const userCreatedEvent = createArvoEventFactory(
	  userCreateContract.version('1.0.0')
  ).accepts({
    subject: 'test-subject',
    source: 'com.test.test',
    data: { name: 'John Doe' }
  });

  const outputEvents = await handler.execute(userCreatedEvent);
  
  expect(outputEvents).toHaveLength(1);
  expect(outputEvents[0].type).toBe('evt.user.created');
  expect(outputEvents[0].data.userId).toBeDefined();
});
```

### Contract-Based Validation

Arvo handlers are bound to an `ArvoContract` that specifies the events they can accept and emit. This contract is automatically validated at runtime.

If a handler tries to emit an event that doesn't conform to its contract, Arvo will throw a `ContractViolation` error. You can test this behavior directly:

```typescript
it('should throw ContractViolation if emitting invalid event', async () => {
  const inputEvent = createArvoEvent({
    type: 'com.user.create',
    data: { name: 'John Doe' }
    ...rest,
  });

  await expect(handler.execute(inputEvent)).rejects.toThrow(ContractViolation);
});
```

This test ensures that the handler adheres to its contract, providing an additional layer of safety and testability.

### Integration Testing

Arvo's contract-based design and use of the `ArvoEventFactory` pattern enable robust integration testing without needing to write extensive test code. The `ArvoContract` serves as a single source of truth that all services share, providing a clear specification of each service's expected behavior and interactions. Since inter-service communication must strictly adhere to the contract via `ArvoEvent`s, integration testing becomes more focused on verifying that events flow correctly through the system as a whole, rather than exhaustively testing every possible interaction between services. This contract-driven approach catches many potential integration issues at the contract level, reducing the surface area that needs to be covered by traditional integration tests. As a result, integration testing in Arvo can concentrate on high-level event flows and key scenarios, confident that the contract enforcement will maintain the agreed-upon interfaces between services.

## Conclusion

Arvo is a TypeScript framework designed to make building reliable, evolvable event-driven systems easier. It does this through:

1. **Contract-first development**: Service interfaces are defined upfront in ArvoContracts. These aren't just documentation, but are actively enforced in the code.
2. **Strong typing**: Leveraging TypeScript allows for compile-time checks of event payloads against the contracts. 
3. **Versioned contracts**: Each version of a contract is treated as an independent interface. This allows services to evolve without breaking consumers.
4. **EventHandlerFactory pattern**: A consistent way to create event handlers, injecting dependencies. Enables easier testing.
5. **Built-in error handling**: Errors are automatically converted to system events or thrown as violations. Reduces boilerplate.
6. **Observability**: Integration with OpenTelemetry for tracing and logToSpan utility for logging. Visibility into complex flows.
7. **Scalability**: The functional handler design (ArvoEvent in, array of ArvoEvents out) allows horizontal and vertical scaling.

The key idea is that by making service contracts first-class citizens and providing a structured way to create and evolve event-driven services, Arvo helps tame the complexity inherent in distributed systems development. While it makes trade-offs (like the additional code for versioned handlers), these are designed to prioritise maintainability and reliability over raw conciseness.

Of course, Arvo isn't a silver bullet - it's one opinionated approach to the challenges of event-driven architectures. But by learning from the history of SOA and more recent serverless trends, it attempts to provide a pragmatic, TypeScript-native framework for building the next generation of evolvable systems.

## Appendix

- For an indepth view of the functioning and execution of the ArvoEventHandler, please refer to the [exection diagrams](https://github.com/SaadAhmad123/arvo-event-handler/blob/main/src/ArvoEventHandler/ExecutionDiagrams.md) of the `.execute` method.
- Reade more about the `ArvoContract` in the `arvo-core` [documentation](https://saadahmad123.github.io/arvo-core/documents/ArvoContract.html).