export function sanitizeForJsonParse(input: string): string {
	// Strip UTF-8 BOM and common accidental NUL bytes before JSON.parse.
	return input.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
}
