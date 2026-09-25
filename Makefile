FVER ?= $(shell git describe --tags --match 'fregoli/v*' --always --dirty 2>/dev/null || echo dev)
FVER := $(patsubst fregoli/v%,%,$(FVER))
export FREGOLI_VERSION ?= $(FVER)

.PHONY: test build

build:
	@echo fregoli $(FREGOLI_VERSION)

test:
	npm test
