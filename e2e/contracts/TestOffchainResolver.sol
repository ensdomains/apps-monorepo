// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * An ENSIP-10 resolver that answers every read through CCIP-Read (EIP-3668),
 * like a Namespace or Coinbase offchain resolver. The e2e gateway
 * (`e2e/helpers/ccip-gateway.ts`) returns the ABI-encoded result for the
 * original `data`, and the callback hands it back unchanged — there is no
 * signer, because neither app verifies gateway signatures.
 *
 * It has no setters, so both apps take their batched `resolve(multicall)`
 * read path against it.
 */
contract TestOffchainResolver {
    error OffchainLookup(
        address sender,
        string[] urls,
        bytes callData,
        bytes4 callbackFunction,
        bytes extraData
    );

    string[] private _urls;

    constructor(string[] memory urls_) {
        _urls = urls_;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x9061b923; // ENSIP-10 resolve(bytes,bytes)
    }

    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        returns (bytes memory)
    {
        revert OffchainLookup(
            address(this),
            _urls,
            abi.encodeCall(this.resolve, (name, data)),
            this.resolveCallback.selector,
            ""
        );
    }

    function resolveCallback(bytes calldata response, bytes calldata)
        external
        pure
        returns (bytes memory)
    {
        return response;
    }
}
