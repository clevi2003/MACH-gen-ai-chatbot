import React, { useState } from "react";
import { Box, Link, Modal, TextContent } from "@cloudscape-design/components";

export function TruncatedTextCell({ text, maxLength = 50 }) {
  const [showModal, setShowModal] = useState(false);

  const handleShowMore = () => {
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
  };

  const truncatedText = text.length > maxLength ? text.slice(0, maxLength) + "..." : text;

  return (
    <>
      <Box>
        <TextContent>{truncatedText}</TextContent>
        {text.length > maxLength && (
          <Link onFollow={handleShowMore}>Show More</Link>
        )}
      </Box>
      <Modal
        onDismiss={handleClose}
        visible={showModal}
        header="Full Text"
        footer={
          <Box float="right">
            <Link onFollow={handleClose}>Close</Link>
          </Box>
        }
      >
        <TextContent>{text}</TextContent>
      </Modal>
    </>
  );
}