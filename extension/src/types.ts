export type ASPMessage = {
  id: string;
  from: string;
  to: string;
  type: "text" | "error";
  content: {
    text: string;
  };
};

export type GobioConfig = {
  relayUrl: string;
  handle: string;
  token: string;
};
