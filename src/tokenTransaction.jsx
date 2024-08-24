import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import React, { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import Snackbar from "@mui/material/Snackbar";
import { create } from 'ipfs-http-client'; // Import IPFS HTTP client
import { serialize } from 'borsh';


const ipfsClient = create({ 
    host: 'ipfs.infura.io', 
    port: 5001, 
    protocol: 'https' 
});

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// Define the Borsh schema
class CreateMetadataArgs {
    constructor(properties) {
        Object.keys(properties).forEach(key => {
            this[key] = properties[key];
        });
    }
}

const METADATA_SCHEMA = new Map([
    [CreateMetadataArgs, {
        kind: "struct",
        fields: [
            ["name", "string"],
            ["symbol", "string"],
            ["uri", "string"],
            ["sellerFeeBasisPoints", "u16"],
            ["creators", { kind: "option", type: ["pubkey"] }]
        ]
    }]
]);

const TokenCreationForm = () => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(0);
  const [supply, setSupply] = useState(0);
  const [description, setDescription] = useState("");
  const [freezeAuthority, setFreezeAuthority] = useState("");
  const [logo, setLogo] = useState(null); // State to store the logo file
  const [isLoading, setIsLoading] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [state, setState] = useState({
    open: false,
    message: "",
    vertical: "top",
    horizontal: "center",
  });
  const { vertical, horizontal, open, message } = state;

  const handleClose = () => {
    setState({ ...state, open: false });
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    setLogo(file);
    if (file) {
        const url = URL.createObjectURL(file);
        setLogoPreview(url);
        console.log("Logo file:", url);
      }

  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!publicKey) {
        setState({
            open: true,
            message: "Please connect your wallet first.",
            vertical: "top",
            horizontal: "center",
        });
        return;
    }

    setIsLoading(true);

    try {
        // Check if the user has enough SOL for the transaction
        const balance = await connection.getBalance(publicKey);
        const requiredBalance = 0.02 * LAMPORTS_PER_SOL;
        if (balance < requiredBalance) {
            setState({
                open: true,
                message: `Insufficient SOL balance. You need at least ${
                    requiredBalance / LAMPORTS_PER_SOL
                } SOL to create a token.`,
                vertical: "top",
                horizontal: "center",
            });
            setIsLoading(false);
            return;
        }

        // Create a mint with the freeze authority (if provided)
        const freezeAuthorityKey = freezeAuthority
            ? new PublicKey(freezeAuthority)
            : null;
        const mint = await splToken.createMint(
            connection,
            publicKey,
            publicKey,
            freezeAuthorityKey,
            decimals
        );

        // Create an associated token account for the mint
        const tokenAccount = await splToken.createAccount(
            connection,
            publicKey,
            mint,
            publicKey
        );

        // Mint the specified supply of tokens to the account
        await splToken.mintTo(
            connection,
            publicKey,
            mint,
            tokenAccount,
            publicKey,
            supply
        );

        // Upload the logo image to IPFS using Pinata
        let imageUrl = "";
        if (logo) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                try {
                    const buffer = Buffer.from(reader.result);
                    const result = await ipfsClient.add(buffer);
                    imageUrl = `https://ipfs.infura.io/ipfs/${result.path}`;
                    console.log("Image uploaded to IPFS:", imageUrl);
                } catch (err) {
                    console.error("Error uploading image to IPFS:", err);
                }
            };
            reader.readAsArrayBuffer(logo);
        }

        // Create a metadata JSON object and upload it to IPFS
        const metadata = {
            name: name,
            symbol: symbol,
            description: description,
            image: imageUrl
        };

        const result = await ipfsClient.add(JSON.stringify(metadata));
        const metadataUri = `https://ipfs.infura.io/ipfs/${result.path}`;
        console.log("Metadata uploaded to IPFS:", metadataUri);

        // Find the metadata account PDA
        const metadataAccount = await PublicKey.findProgramAddress(
            [
                Buffer.from("metadata"),
                TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                mint.toBuffer()
            ],
            TOKEN_METADATA_PROGRAM_ID
        );

        // Define the metadata arguments for creating the token's metadata account
        const metadataArgs = new CreateMetadataArgs({
            name: name,
            symbol: symbol,
            uri: metadataUri,
            sellerFeeBasisPoints: 500, // Set this according to your needs
            creators: null // You can specify creators if needed
        });

        // Serialize the metadata
        const metadataBuffer = serialize(METADATA_SCHEMA, metadataArgs);

        // Create the instruction to create the metadata account
        const createMetadataInstruction = new TransactionInstruction({
            keys: [
                { pubkey: metadataAccount[0], isSigner: false, isWritable: true },
                { pubkey: mint, isSigner: false, isWritable: true },
                { pubkey: publicKey, isSigner: true, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: TOKEN_METADATA_PROGRAM_ID,
            data: Buffer.from(metadataBuffer)
        });

        // Send the transaction to create the metadata account
        const transaction = new Transaction().add(createMetadataInstruction);
        const signature = await sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, "confirmed");

        console.log(`Metadata created! Transaction signature: ${signature}`);
        alert(`Metadata created! Transaction signature: ${signature}`);

    } catch (error) {
        console.error("Error creating token:", error);
        setState({
            open: true,
            message: error.message,
            vertical: "top",
            horizontal: "center",
        });
    }

    setIsLoading(false);
};

  
  return (
    <div className="min-h-screen z-20 bg-[#0b0d0f] text-white">
      <form
        onSubmit={handleSubmit}
        className="max-w-3xl mx-auto p-8 bg-[#1f1f1f] rounded-lg shadow-lg"
      >
        <h2 className="text-center text-3xl font-bold mb-8">
          Solana Token Creator
        </h2>

        <div className="mb-6 flex justify-between items-center">
          <label className="block text-sm font-semibold mb-2" htmlFor="name">
            * Name:
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-2/3 px-4 py-2 bg-[#2e2e2e] border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="mb-6 flex justify-between items-center">
          <label className="block text-sm font-semibold mb-2" htmlFor="symbol">
            * Symbol:
          </label>
          <input
            id="symbol"
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required
            className="w-2/3 px-4 py-2 bg-[#2e2e2e] border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="mb-6 flex justify-between items-center">
          <label
            className="block text-sm font-semibold mb-2"
            htmlFor="decimals"
          >
            * Decimals:
          </label>
          <input
            id="decimals"
            type="number"
            value={decimals}
            onChange={(e) => setDecimals(Number(e.target.value))}
            required
            className="w-2/3 px-4 py-2 bg-[#2e2e2e] border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="mb-6 flex justify-between items-center">
          <label className="block text-sm font-semibold mb-2" htmlFor="supply">
            * Supply:
          </label>
          <input
            id="supply"
            type="number"
            value={supply}
            onChange={(e) => setSupply(Number(e.target.value))}
            required
            className="w-2/3 px-4 py-2 bg-[#2e2e2e] border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="mb-6 flex justify-between items-center">
          <label className="block text-sm font-semibold mb-2" htmlFor="supply">
            * Description:
          </label>
          <textarea
            id="description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className="w-2/3 px-4 py-2 bg-[#2e2e2e] border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2" htmlFor="image">
            * Image:
          </label>
          <div className="flex items-center">
            <div className="w-1/3 h-36 bg-[#2e2e2e] border border-gray-600 rounded-md flex items-center justify-center">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Token logo"
                  className="h-24 w-24 object-cover"
                />
              ) : (
                <span className="text-gray-400">No image uploaded</span>
              )}
            </div>
            <input
              id="image"
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="ml-4 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Most meme coins use a square 1000x1000 logo
          </p>
        </div>

        <div className="mb-6 flex justify-between items-center">
          <label
            className="block text-sm font-semibold mb-2"
            htmlFor="freezeAuthority"
          >
            Freeze Authority:
          </label>
          <input
            id="freezeAuthority"
            type="text"
            value={freezeAuthority}
            onChange={(e) => setFreezeAuthority(e.target.value)}
            placeholder="Optional"
            className="w-2/3 px-4 py-2 bg-[#2e2e2e] border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        {publicKey ? (
          <p className="text-center text-sm mb-6">
            Connected wallet:{" "}
            <span className="font-mono">{publicKey.toBase58()}</span>
          </p>
        ) : (
          <p className="text-center text-sm mb-6">
            Please connect your wallet.
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full px-4 py-3 font-semibold text-white rounded-md shadow-lg ${
            isLoading ? "bg-gray-600" : "bg-blue-600 hover:bg-blue-700"
          } focus:outline-none`}
        >
          {isLoading ? "Creating Token..." : "Create Token"}
        </button>
      </form>
      <Snackbar
        anchorOrigin={{ vertical, horizontal }}
        open={open}
        onClose={handleClose}
        variant="filled"
        severity="failed"
        message={message}
        key={vertical + horizontal}
        autoHideDuration={3000}
      />
    </div>
  );
};

export default TokenCreationForm;
