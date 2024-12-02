import React, { useState, useEffect, useContext, useCallback, useRef, useMemo } from 'react';
import {
  Header,
  SpaceBetween,
  Alert,
  Button,
  Box,
  Pagination,
  StatusIndicator,
  TextContent,
  Table,
  Container,
} from '@cloudscape-design/components';
import { Auth } from 'aws-amplify';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { useNotifications } from '../../../components/notif-manager';
import { Utils } from '../../../common/utils';
import { ApiClient } from '../../../common/api-client/api-client';
import { AppContext } from '../../../common/app-context';
import { AdminDataType } from '../../../common/types';
import { getColumnDefinition } from '../columns';

const findFirstSortableColumn = (columns) => {
  return columns.find((col) => col.sortingField && !col.disableSort) || columns[0];
};

export interface SetActivePromptTabProps {
  tabChangeFunction?: () => void;
  documentType: AdminDataType;
}

export default function SetPromptTab(props: SetActivePromptTabProps) {
  const [promptText, setPromptText] = useState('');
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appContext = useContext(AppContext);
  const apiClient = useMemo(() => new ApiClient(appContext), [appContext]); // Memoize apiClient
  const { addNotification } = useNotifications();

  const [selectedItems, setSelectedItems] = useState<any[]>([]);

  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pages, setPages] = useState<any[]>([]);

  // Admin check
  useEffect(() => {
    (async () => {
      try {
        const result = await Auth.currentAuthenticatedUser();
        if (!result) {
          console.log('Signed out!');
          Auth.signOut();
          setAdmin(false);
          return;
        }
        const role = result?.signInUserSession?.idToken?.payload['custom:role'];
        if (role) {
          const roles = JSON.parse(role);
          if (roles.includes('Admin')) {
            setAdmin(true);
          } else {
            setAdmin(false);
          }
        } else {
          setAdmin(false);
        }
      } catch (e) {
        console.error('Error checking admin status:', e);
        Auth.signOut();
        setAdmin(false);
      } finally {
        setIsCheckingAdmin(false);
      }
    })();
  }, []);

  // Fetch prompts (only once on component mount)
  useEffect(() => {
    if (admin !== true) return;

    const fetchPrompts = async () => {
      setLoadingPrompts(true);
      try {
        const result = await apiClient.knowledgeManagement.listStagedSystemPrompts();
        setPages([result]);
      } catch (error) {
        console.error('Error fetching prompts: ', error);
        addNotification('error', 'Error fetching prompts');
      } finally {
        setLoadingPrompts(false);
      }
    };

    fetchPrompts();
  }, [admin, apiClient, addNotification]);

  const currentPageItems = pages[currentPageIndex - 1]?.prompts || [];

  const columnDefinitions = getColumnDefinition('prompt');
  const defaultSortingColumn = findFirstSortableColumn(columnDefinitions);

  // Use useCollection without the selection option
  const { items, collectionProps } = useCollection(currentPageItems, {
    sorting: {
      defaultState: {
        sortingColumn: defaultSortingColumn,
        isDescending: false,
      },
    },
  });

  // Handle selection change
  const handleSelectionChange = (e) => {
    const newSelectedItems = e.detail.selectedItems;
    if (
      selectedItems.length > 0 &&
      newSelectedItems.length > 0 &&
      selectedItems[0].PromptId === newSelectedItems[0].PromptId
    ) {
      // Clicking the same row, unselect it
      setSelectedItems([]);
      // Clear the prompt text
      setPromptText('');
    } else {
      setSelectedItems(newSelectedItems);
      // Set the prompt text to the selected row's prompt
      setPromptText(newSelectedItems[0].Prompt);
    }
  };

  const onNextPageClick = () => {
    setCurrentPageIndex((current) => Math.min(pages.length, current + 1));
  };

  const onPreviousPageClick = () => {
    setCurrentPageIndex((current) => Math.max(1, current - 1));
  };

  const handleSetActivePrompt = async () => {
    if (!selectedItems.length) return;
    setIsSaving(true);
    try {
      await apiClient.knowledgeManagement.setSystemPrompt(selectedItems[0].Prompt, selectedItems[0].PromptId);
      addNotification('success', 'Active system prompt set successfully');
      // Clear selection and prompt text
      setSelectedItems([]);
      setPromptText('');
    } catch (error) {
      console.error('Error setting active prompt:', error);
      addNotification('error', 'Failed to set active prompt');
    } finally {
      setIsSaving(false);
    }
  };

  // Render logic
  if (isCheckingAdmin) {
    return <div>Loading...</div>;
  }

  if (!admin) {
    return (
      <Alert header="Access Denied" type="error">
        You are not authorized to view this page!
      </Alert>
    );
  }

  return (
    <div>
      <Header variant="h1">Set a New Active System Prompt</Header>
      <SpaceBetween size="l">
        {error && (
          <Alert header="Error" type="error">
            {error}
          </Alert>
        )}
        <Container header={<Header variant="h2">Selected Prompt</Header>}>
          <SpaceBetween size="s">
            <Box padding={{ vertical: 's', horizontal: 'm' }}>
              <TextContent>
                {promptText ? (
                  <p>{promptText}</p>
                ) : (
                  <p style={{ color: '#888' }}>
                    Please select a staged system prompt to set as the active prompt
                  </p>
                )}
              </TextContent>
            </Box>
            <Button onClick={handleSetActivePrompt} disabled={!selectedItems.length || isSaving}>
              {isSaving ? 'Setting...' : 'Set Active System Prompt'}
            </Button>
          </SpaceBetween>
        </Container>
        <Table
          {...collectionProps}
          loading={loadingPrompts}
          loadingText={'Loading prompts'}
          columnDefinitions={columnDefinitions}
          items={items}
          selectionType="single"
          selectedItems={selectedItems}
          onSelectionChange={handleSelectionChange}
          trackBy="PromptId"
          header={<Header>Available Staged System Prompts</Header>}
          empty={
            !loadingPrompts && (
              <Box textAlign="center">
                <StatusIndicator type="warning">
                  No staged system prompts available. Please stage a system prompt before attempting
                  to set an active system prompt.
                </StatusIndicator>
              </Box>
            )
          }
          pagination={
            pages.length <= 1 ? null : (
              <Pagination
                currentPageIndex={currentPageIndex}
                pagesCount={pages.length}
                onNextPageClick={onNextPageClick}
                onPreviousPageClick={onPreviousPageClick}
              />
            )
          }
        />
      </SpaceBetween>
    </div>
  );
}
