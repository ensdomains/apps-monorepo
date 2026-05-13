const formatToParts = (value, { locales, format, }, prefix, suffix) => {
    const formatter = new Intl.NumberFormat(locales, format);
    const parts = formatter.formatToParts(Number(value));
    if (prefix)
        parts.unshift({ type: "prefix", value: prefix });
    if (suffix)
        parts.push({ type: "suffix", value: suffix });
    const pre = [];
    const _integer = []; // we do a second pass to key these from RTL
    const fraction = [];
    const post = [];
    const counts = {};
    const generateKey = (type) => `${type}:${(counts[type] = (counts[type] ?? -1) + 1)}`;
    let formatted = "";
    let seenInteger = false, seenDecimal = false;
    for (const part of parts) {
        formatted += part.value;
        // Merge plus and minus sign types (doing it this way appeases TypeScript)
        const type = part.type === "minusSign" || part.type === "plusSign"
            ? "sign"
            : part.type;
        switch (type) {
            case "integer":
                seenInteger = true;
                _integer.push(...part.value
                    .split("")
                    .map((d) => ({ type, value: parseInt(d) })));
                break;
            case "group":
                _integer.push({ type, value: part.value });
                break;
            case "decimal":
                seenDecimal = true;
                fraction.push({
                    type,
                    value: part.value,
                    key: generateKey(type),
                });
                break;
            case "fraction":
                fraction.push(...part.value.split("").map((d) => ({
                    type,
                    value: parseInt(d),
                    key: generateKey(type),
                })));
                break;
            // case 'nan':
            // case 'infinity':
            // 	// TODO: handle these
            // 	break
            // case 'exponentSeparator':
            // 	break
            // case 'exponentMinusSign':
            // case 'exponentInteger':
            // 	break
            default:
                (seenInteger || seenDecimal ? post : pre).push({
                    type,
                    value: part.value,
                    key: generateKey(type),
                });
        }
    }
    const integer = [];
    // Key the integer parts RTL, for better layout animations
    for (let i = _integer.length - 1; i >= 0; i--) {
        integer.unshift({
            ..._integer[i],
            key: generateKey(_integer[i].type),
        });
    }
    return { pre, integer, fraction, post, formatted };
};

export { formatToParts };
