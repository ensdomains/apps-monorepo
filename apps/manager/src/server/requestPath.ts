// Every name the server normalises comes from the path, and normalising
// takes more than linear time in the name's length.
const REQUEST_PATH_MAX_LENGTH = 2048

/** Whether a request path (still percent-encoded) is too long to route. */
export const isRequestPathTooLong = (pathname: string): boolean =>
  pathname.length > REQUEST_PATH_MAX_LENGTH
