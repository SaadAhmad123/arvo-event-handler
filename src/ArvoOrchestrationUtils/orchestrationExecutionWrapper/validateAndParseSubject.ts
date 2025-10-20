import type { Span } from '@opentelemetry/api';
import { type ArvoEvent, ArvoOrchestrationSubject, type ArvoOrchestrationSubjectContent, logToSpan } from 'arvo-core';
import type { SyncEventResource } from '../../SyncEventResource';

/**
 * Validates and parses orchestration subject
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
