import React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";

const WalletButton = () => {
  const { connected, publicKey } = useWallet();

  const formatPublicKey = (key) => {
    const keyStr = key.toString();
    return `${keyStr.slice(0, 4)}....${keyStr.slice(-4)}`;
  };

  return (
    <WalletMultiButton>
      <div>
        <AccountBalanceWalletIcon sx={{ marginRight: "5px", marginTop: "-3px" }} />
        {connected ? formatPublicKey(publicKey) : "Connect Wallet"}
      </div>
    </WalletMultiButton>
  );
};

export default WalletButton;
