// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PlayerRegistry {
    struct Player {
        address wallet;
        string baseName;
        string displayName;
    }

    mapping(address => Player) private players;
    mapping(string => address) private nameToAddress;

    event PlayerRegistered(address indexed wallet, string baseName, string displayName);
    event DisplayNameChanged(address indexed wallet, string oldName, string newName);

    error NameTaken(string name);
    error NotOwner();

    /// @notice Register a new player or update their base/display name.
    function registerPlayer(string memory baseName, string memory displayName) external {
        Player storage player = players[msg.sender];

        // If display name exists and is owned by another wallet → revert
        address existingOwner = nameToAddress[toLower(displayName)];
        if (existingOwner != address(0) && existingOwner != msg.sender) {
            revert NameTaken(displayName);
        }

        // If player already has a display name → free it
        if (bytes(player.displayName).length > 0) {
            delete nameToAddress[toLower(player.displayName)];
        }

        // Save player data
        player.wallet = msg.sender;
        player.baseName = baseName;
        player.displayName = displayName;

        nameToAddress[toLower(displayName)] = msg.sender;

        emit PlayerRegistered(msg.sender, baseName, displayName);
    }

    /// @notice Change only display name (must be unique)
    function changeDisplayName(string memory newDisplayName) external {
        Player storage player = players[msg.sender];
        if (player.wallet == address(0)) revert NotOwner();

        address existingOwner = nameToAddress[toLower(newDisplayName)];
        if (existingOwner != address(0) && existingOwner != msg.sender) {
            revert NameTaken(newDisplayName);
        }

        string memory oldName = player.displayName;
        if (bytes(oldName).length > 0) {
            delete nameToAddress[toLower(oldName)];
        }

        player.displayName = newDisplayName;
        nameToAddress[toLower(newDisplayName)] = msg.sender;

        emit DisplayNameChanged(msg.sender, oldName, newDisplayName);
    }

    /// @notice Get player data
    function getPlayer(address wallet) external view returns (Player memory) {
        return players[wallet];
    }

    /// @notice Check if a display name is available
    function isNameAvailable(string memory name) external view returns (bool) {
        return nameToAddress[toLower(name)] == address(0);
    }

    /// @dev Helper to lowercase strings (for case-insensitive uniqueness)
    function toLower(string memory str) internal pure returns (string memory) {
        bytes memory bStr = bytes(str);
        bytes memory bLower = new bytes(bStr.length);
        for (uint i = 0; i < bStr.length; i++) {
            if (bStr[i] >= 0x41 && bStr[i] <= 0x5A) {
                bLower[i] = bytes1(uint8(bStr[i]) + 32);
            } else {
                bLower[i] = bStr[i];
            }
        }
        return string(bLower);
    }
}
