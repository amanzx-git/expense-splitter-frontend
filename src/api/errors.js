// The one message shown whenever the backend cannot be reached or a gateway fails.
export const UNAVAILABLE_MESSAGE = 'We cannot connect right now. Please try again.';

// kind: 'api'          a normal answer from Django ({code,message,fields} per the contract)
//       'server'       Django answered 5xx with the contract's JSON body (a real server bug)
//       'network'      the request never got an answer (offline, refused, DNS, CORS)
//       'timeout'      we gave up waiting
//       'gateway'      502/503/504, or a 5xx that is not Django's JSON (proxy / host error page)
//       'bad_response' 2xx that is not JSON (for example a static host answering for /api)
// unavailable = true for network, timeout, gateway and bad_response: "the server is not
// usable right now", as opposed to the server telling us something is wrong with the request.
export class ApiError extends Error {
  constructor({ status, code, message, fields, kind = 'api', unavailable = false, outcomeUnknown = false }) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // HTTP status, or 0 when there was no HTTP answer
    this.code = code; // contract code, or SERVER_UNAVAILABLE (client-side only, never sent or received)
    this.fields = fields ?? {};
    this.kind = kind;
    this.unavailable = unavailable;
    // true when the server may have processed the request even though we got no answer
    this.outcomeUnknown = outcomeUnknown;
  }
}

export function unavailableError(kind, status = 0) {
  return new ApiError({
    status,
    code: 'SERVER_UNAVAILABLE',
    message: UNAVAILABLE_MESSAGE,
    kind,
    unavailable: true,
    outcomeUnknown: kind === 'timeout' || status === 504,
  });
}

// A deliberate cancellation (AbortController.abort()) is NOT an ApiError: it is not a failure.
export function cancelledError() {
  return new DOMException('The request was cancelled.', 'AbortError');
}

export const isUnavailable = (err) => err instanceof ApiError && err.unavailable;
export const isCancelled = (err) => !(err instanceof ApiError) && err?.name === 'AbortError';
