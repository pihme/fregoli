FVER ?= $(shell git describe --tags --match 'fregoli/v*' --dirty 2>/dev/null || echo dev)
export FREGOLI_VERSION ?= $(FVER)

.PHONY: test build

build:
	@echo $(FREGOLI_VERSION)

test:
	npm test
