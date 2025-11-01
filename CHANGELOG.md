# Changelog

## [0.0.1] - 2024-09-07

- Finalised version 0.0.1 of the event handlers for Arvo

## [0.0.4] - 2024-09-09

- Finalised Event Handler implementation

## [0.0.5] - 2024-09-10

- Updated routing

## [1.0.0] - 2024-09-10

- First version rrelease

## [1.0.2] - 2024-09-10

- Added ArvoEventRouter as a mechanism to group ArvoEventHandlers

## [1.1.0] - 2024-09-30

- Added Abstract handler class and bound all handlers to it

## [2.0.0] - 2024-11-26

- Added support for versioned contracts in event handler for better versioning support

## [2.1.1] - 2024-12-10

- Updated the telemetry implementation to be more streamlined, fixed some minor bugs and added better telemetry logging

## [2.1.4] - 2024-12-19

- Updated the opentelemetry core version and arvo core versions

## [2.2.0] - 2024-12-25

- Stable release for arvo event handler version 2

## [2.2.5] - 2024-12-25

- Added better error boundaries for the handlers
## [2.2.10] - 2025-01-29

- Updated dependency versions and added more tests

## [2.3.0] - 2025-06-22

Enabling orchestrations to have domained events.

#### Breaking Change

All event handlers now return an object instead of an array:

#### Standard Event Handlers:

**Before**: const events = await handler.execute(event)
**After**: const { events } = await handler.execute(event)

## [3.0.0] - 2025-07-24

- Migrated all `arvo-xstate` features
- Added `ArvoResumable` handler
- Added advanced domained handling## [3.0.10] - 2025-10-21

- Better OTEL Logging

## [3.0.15] - 2025-10-23

- Updated the tsdocs in the code

## [3.0.18] - 2025-11-02

- Finally added a test suite runner for Arvo Event Handlers. I tried to make it a general as possible

