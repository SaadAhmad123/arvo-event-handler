import { ArvoEvent } from 'arvo-core';

/**
 * Creates a new ArvoEvent with telemetry headers (traceparent and tracestate) removed.
 *
 * @param event - The original ArvoEvent to process
 * @returns A new ArvoEvent instance with all original properties except telemetry headers
 *
 * @remarks
 * This function creates a clean copy of an ArvoEvent by:
 * 1. Preserving all standard event properties
 * 2. Setting telemetry headers (traceparent and tracestate) to null
 * 3. Maintaining the original data and extensions
 *
 * It's useful when you need to:
 * - Clear existing telemetry context
 * - Start a new telemetry trace
 * - Remove distributed tracing information
 *
 * @see {@link ArvoEvent} for complete event structure
 */
export const deleteOtelHeaders = (event: ArvoEvent) =>
  new ArvoEvent(
    {
      id: event.id,
      time: event.time,
      source: event.source,
      specversion: '1.0',
      type: event.type,
      subject: event.subject,
      datacontenttype: event.datacontenttype,
      dataschema: event.dataschema,
      to: event.to,
      accesscontrol: event.accesscontrol,
      redirectto: event.redirectto,
      executionunits: event.executionunits,
      traceparent: null,
      tracestate: null,
    },
    event.data,
    event.cloudevent.extensions,
  );
