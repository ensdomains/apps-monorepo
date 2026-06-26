export class MetaTagInjector {
  readonly #tags: string

  constructor(tags: string) {
    this.#tags = tags
  }

  element(element: Element): void {
    element.append(this.#tags, { html: true })
  }
}

export class TitleRewriter {
  readonly #title: string

  constructor(title: string) {
    this.#title = title
  }

  element(element: Element): void {
    element.setInnerContent(this.#title)
  }
}
