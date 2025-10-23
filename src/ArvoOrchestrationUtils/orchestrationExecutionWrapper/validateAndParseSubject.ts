import type { Span } from '@opentelemetry/api';
import { type ArvoEvent, ArvoOrchestrationSubject, type ArvoOrchestrationSubjectContent, logToSpan } from 'arvo-core';
import type { SyncEventResource } from '../../SyncEventResource';

/**
 * Validates and parses an orchestration event's subject.
 *
 * Ensures the event subject is valid and matches the expected orchestrator source.
 * Returns null if validation fails, allowing graceful handling of mismatched events.
 *
 * @returns Parsed subject content or null if validation fails
 */
export const validateAndParseSubject = (
  event: ArvoEvent,
  expectedSource: string,
  syncEventResource: SyncEventResource<any>,
  span: Span,
  handlerType: 'orchestrator' | 'resumable',
): ArvoOrchestrationSubjectContent | null => {
  syncEventResource.validateEventSubject(event, span);
  const parsedEventSubject = ArvoOrchestrationSubject.parse(event.subject);
  span.setAttributes({
    [`arvo.parsed.subject.${handlerType}.name`]: parsedEventSubject.orchestrator.name,
    [`arvo.parsed.subject.${handlerType}.version`]: parsedEventSubject.orchestrator.version,
  });
  if (parsedEventSubject.orchestrator.name !== expectedSource) {
    logToSpan(
      {
        level: 'WARNING',
        message: `Event subject mismatch - expected '${expectedSource}' but got '${parsedEventSubject.orchestrator.name}'`,
      },
      span,
    );
    return null;
  }
  return parsedEventSubject;
};
