FUZZ_MODE=$1
CONTRACT=Echidna_$2

echidna-test contracts/echidna/$CONTRACT.t.sol --contract $CONTRACT --config contracts/echidna/$FUZZ_MODE.config.yaml --check-asserts