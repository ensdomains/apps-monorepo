function findCustomTarget(target) {
    return target.closest("[data-cursor]");
}
function findPointerTarget(element) {
    return element.closest('a, button, input[type="button"]:not(:disabled)');
}
function findTextTarget(element) {
    if (window.getComputedStyle(element).userSelect === "none")
        return null;
    return element.closest("p, textarea:not(:disabled), input[type='text']:not(:disabled), h1, h2, h3, h4, h5, h6");
}
function findTarget(eventTarget) {
    let target = findCustomTarget(eventTarget);
    if (target)
        return [target.dataset.cursor, target];
    target = findPointerTarget(eventTarget);
    if (target)
        return ["pointer", target];
    target = findTextTarget(eventTarget);
    if (target)
        return ["text", target];
    return ["default", null];
}

export { findTarget };
