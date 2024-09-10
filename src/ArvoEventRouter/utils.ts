import { ArvoEvent } from 'arvo-core';

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
