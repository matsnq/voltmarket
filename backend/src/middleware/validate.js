// Server-side input validation with zod. Schemas whitelist exactly the
// expected fields (`.strict()`), check syntax (format) and semantics (ranges,
// contextual rules). Client-side validation mirrors these rules for UX; this
// layer is the security boundary.
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    req.validated = { ...(req.validated || {}), [source]: result.data };
    return next();
  };
}

module.exports = { validate };
