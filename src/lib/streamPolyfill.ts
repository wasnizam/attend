// Safari (iPhone and Mac) cannot loop over a ReadableStream with `for await`, which the
// PDF library relies on. This adds the missing piece where it is absent; it does nothing
// in browsers that already have it. Imported by both the page and the PDF worker.
const proto = typeof ReadableStream === 'undefined' ? null : (ReadableStream.prototype as unknown as Record<symbol, unknown>)

if (proto && !proto[Symbol.asyncIterator]) {
  proto[Symbol.asyncIterator] = async function* (this: ReadableStream<unknown>) {
    const reader = this.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
}

export {}
