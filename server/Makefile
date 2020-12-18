dist/rewind: src/ Cargo.toml
	@mkdir -p $(@D)
	cargo build --release
	cp target/release/rewind dist/rewind

.PHONY: clean
clean:
	cargo clean
	rm -rf dist
