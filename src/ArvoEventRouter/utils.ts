import { ArvoEvent, createArvoEvent } from "arvo-core";

export const deleteOtelHeaders = (event: ArvoEvent) => createArvoEvent({
  id: event.id,
  time: event.time,
  source: event.source,
  specversion: '1.0',
  type: event.type,
  subject: event.subject,
  datacontenttype: event.datacontenttype,
  dataschema: event.dataschema ?? undefined,
  data: event.data,
  to: event.to ?? undefined,  
  accesscontrol: event.accesscontrol ?? undefined,
  redirectto: event.redirectto ?? undefined,
  executionunits: event.executionunits ?? undefined,
  traceparent: undefined,
  tracestate: undefined,
})