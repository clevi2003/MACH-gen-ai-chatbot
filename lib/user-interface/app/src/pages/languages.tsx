import React, { useState } from "react";
import {
  BreadcrumbGroup,
  ContentLayout,
  Header,
  SpaceBetween,
  Container,
} from "@cloudscape-design/components";
import BaseAppLayout from "../components/base-app-layout";
import styled from "styled-components";
import useOnFollow from "../common/hooks/use-on-follow";
import { CHATBOT_NAME } from "../common/constants";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";

const ColumnContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
`;

const Column = styled.div`
  flex: 1;
  min-width: 200px;
  padding: 10px;
`;

const LanguageList = styled.ul`
  list-style: none;
  padding: 0;
`;

const LanguageItem = styled.li`
  font-size: 14px;
  padding: 5px 0;
`;

const OrderedList = styled.div`
  margin: 0;
  padding: 0;
`;

const ListItem = styled.li`
  padding: 10px 0;
  font-weight: bold;
  display: flex;
  align-items: center;
  list-style: none; /* Removes default bullet points */
`;

const languages = [
  "Afrikaans",
  "Albanian",
  "Amharic",
  "Arabic",
  "Armenian",
  "Azerbaijani",
  "Bengali",
  "Bosnian",
  "Bulgarian",
  "Catalan",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Croatian",
  "Czech",
  "Danish",
  "Dari",
  "Dutch",
  "English",
  "Estonian",
  "Farsi (Persian)",
  "Filipino, Tagalog",
  "Finnish",
  "French",
  "French (Canada)",
  "Georgian",
  "German",
  "Greek",
  "Gujarati",
  "Haitian Creole",
  "Hausa",
  "Hebrew",
  "Hindi",
  "Hungarian",
  "Icelandic",
  "Indonesian",
  "Irish",
  "Italian",
  "Japanese",
  "Kannada",
  "Kazakh",
  "Korean",
  "Latvian",
  "Lithuanian",
  "Macedonian",
  "Malay",
  "Malayalam",
  "Maltese",
  "Marathi",
  "Mongolian",
  "Norwegian (Bokmål)",
  "Pashto",
  "Polish",
  "Portuguese (Brazil)",
  "Portuguese (Portugal)",
  "Punjabi",
  "Romanian",
  "Russian",
  "Serbian",
  "Sinhala",
  "Slovak",
  "Slovenian",
  "Somali",
  "Spanish",
  "Spanish (Mexico)",
  "Swahili",
  "Swedish",
  "Tamil",
  "Telugu",
  "Thai",
  "Turkish",
  "Ukrainian",
  "Urdu",
  "Uzbek",
  "Vietnamese",
  "Welsh",
];

function splitIntoColumns(data: string[], columns: number): string[][] {
  const result: string[][] = [];
  const columnSize = Math.ceil(data.length / columns);
  for (let i = 0; i < columns; i++) {
    result.push(data.slice(i * columnSize, (i + 1) * columnSize));
  }
  return result;
}

export default function TipsAndQuestions() {
  const onFollow = useOnFollow();
  const columnData = splitIntoColumns(languages, 4);

  const prompts = [
    { title: "Spell out acronyms", details: "Avoid using abbreviations. For example, instead of 'GCC,' use 'Greenfield Community College'." },
    { title: "Be specific and concise", details: "Provide clear and precise questions to help MATCH give accurate responses." },
    { title: "Use keywords", details: "Include important terms in your query, such as 'program' or 'course'." },
    { title: "Ask one question at a time", details: "Breaking down complex questions ensures better answers." },
    { title: "Include relevant details", details: "Specify important context, like skills, subject areas, and your goals, to guide the chatbot's response." },
    { title: "Ask follow-up questions", details: "Build on previous responses by asking follow-ups to get further clarity or additional details." },
  ];

  return (
    <BaseAppLayout
      contentType="cards"
      breadcrumbs={
        <BreadcrumbGroup
          onFollow={onFollow}
          items={[
            {
              text: CHATBOT_NAME,
              href: "/*",
            },
            {
              text: "Multilingual Support",
              href: "/chatbot/tips",
            },
          ]}
        />
      }
      content={
        <ContentLayout
          header={
            <Header variant="h1">Multilingual Support</Header>
          }
        >
          <SpaceBetween size="l">
            <Container
                //   header={
                //     <div style={{marginBottom: "-10px"}}>
                //         <Header
                //         variant="h3"
                //         >
                //         About this page:
                //         </Header> 
                //     </div>               
                //   }
                >
                <SpaceBetween size="xxs">
                  <div style={{ lineHeight: "1.6" }}>
                  MATCH supports 75 languages, so you can message it using the language you're most comfortable in, and it will respond to you in that language!
                  </div>
                  </SpaceBetween>
                </Container>
            <Container>
              <Header
                variant="h3"
                // description="MATCH supports 75 languages, so you can message it using the language you're most comfortable in, and it will respond to you in that language!"
              >
                List of supported languages:
              </Header>
              <ColumnContainer>
                {columnData.map((column, index) => (
                  <Column key={index}>
                    <LanguageList>
                      {column.map((language, langIndex) => (
                        <LanguageItem key={langIndex}>{language}</LanguageItem>
                      ))}
                    </LanguageList>
                  </Column>
                ))}
              </ColumnContainer>
            </Container>
          </SpaceBetween>
        </ContentLayout>
      }
    />
  );
}
