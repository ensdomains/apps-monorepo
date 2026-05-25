function getWidthInEm(element) {
    const { width, fontSize } = getComputedStyle(element);
    return `${parseFloat(width) / parseFloat(fontSize)}em`;
}

export { getWidthInEm };
