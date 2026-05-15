function onlyMouse(callback) {
    return (event) => {
        if (event.pointerType === "mouse") {
            callback(event);
        }
    };
}
function onlyLeftClicks(callback) {
    return onlyMouse((event) => {
        if (event.button === 0) {
            callback(event);
        }
    });
}

export { onlyLeftClicks, onlyMouse };
