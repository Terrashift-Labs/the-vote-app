// swift-tools-version: 5.10
// This Package.swift is for Swift Package Manager integration of shared utilities.
// The main app targets are in TheVoteApp.xcodeproj.

import PackageDescription

let package = Package(
    name: "TheVoteApp",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "TheVoteAppCore", targets: ["TheVoteAppCore"])
    ],
    dependencies: [],
    targets: [
        .target(
            name: "TheVoteAppCore",
            path: "TheVoteApp/Domain"
        ),
        .testTarget(
            name: "TheVoteAppTests",
            dependencies: ["TheVoteAppCore"],
            path: "TheVoteAppTests"
        )
    ]
)
