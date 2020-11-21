APP_NAME := rewind
VERSION := $(shell git describe --abbrev=7 --dirty=-SNAPSHOT)
PACKAGE := $(APP_NAME)-$(VERSION)

target/universal/$(PACKAGE).zip:
	sbt "universal:packageBin"

.PHONY: clean
clean:
	sbt clean
