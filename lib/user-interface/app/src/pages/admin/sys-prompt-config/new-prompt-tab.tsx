import React, { useState, useEffect, useContext, useCallback, useRef, useMemo } from 'react';
import {
  Header,
  SpaceBetween,
  Alert,
  Button,
  Textarea,
  Table,
  Box,
  Pagination,
  StatusIndicator,
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

export interface NewPromptTabProps {
  tabChangeFunction?: () => void;
  documentType: AdminDataType;
}

export default function NewPromptTab(props: NewPromptTabProps) {
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
  const needsRefresh = useRef(false);

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

  // Fetch prompts
  const getPrompts = useCallback(
    async (params: { pageIndex?: number; nextContinuationToken?: string }) => {
      setLoadingPrompts(true);
      try {
        const result = await apiClient.knowledgeManagement.listStagedSystemPrompts(
          params.nextContinuationToken
        );
        console.log('Fetched prompts:', result);
        setPages((current) => {
          if (needsRefresh.current) {
            needsRefresh.current = false;
            return [result];
          }
          if (typeof params.pageIndex !== 'undefined') {
            current[params.pageIndex - 1] = result;
            return [...current];
          } else {
            return [...current, result];
          }
        });
      } catch (error) {
        console.error('Error fetching prompts: ', error);
        addNotification('error', 'Error fetching prompts');
      } finally {
        setLoadingPrompts(false);
      }
    },
    [apiClient] // Only include stable dependencies
  );

  useEffect(() => {
    if (admin !== true) return;
    if (needsRefresh.current) {
      getPrompts({ pageIndex: 1 });
    } else {
      getPrompts({ pageIndex: currentPageIndex });
    }
  }, [admin, getPrompts]);

  const currentPageItems =
    pages[Math.min(pages.length - 1, currentPageIndex - 1)]?.prompts || [];

  const columnDefinitions = getColumnDefinition('prompt');
  const defaultSortingColumn = findFirstSortableColumn(columnDefinitions);

  // Use useCollection without the selection option
  const { items, collectionProps, paginationProps } = useCollection(currentPageItems, {
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

  const onNextPageClick = async () => {
    const continuationToken = pages[currentPageIndex - 1]?.continuation_token;
    if (continuationToken) {
      if (pages.length <= currentPageIndex || needsRefresh.current) {
        await getPrompts({ nextContinuationToken: continuationToken });
      }
      setCurrentPageIndex((current) => Math.min(pages.length + 1, current + 1));
    }
  };

  const onPreviousPageClick = () => {
    setCurrentPageIndex((current) => Math.max(1, current - 1));
  };

  const handleStagePrompt = async () => {
    if (!promptText) return;
    setIsSaving(true);
    try {
      await apiClient.knowledgeManagement.stageSystemPrompt(promptText);
      addNotification('success', 'Prompt staged successfully');
      // Refresh the prompts list after saving
      needsRefresh.current = true;
      setCurrentPageIndex(1);
      getPrompts({ pageIndex: 1 });
      // Clear selection and prompt text
      setSelectedItems([]);
      setPromptText('');
    } catch (error) {
      console.error('Error staging prompt:', error);
      addNotification('error', 'Failed to stage prompt');
    } finally {
      setIsSaving(false);
    }
  };

  // Refresh function
  const onRefresh = () => {
    needsRefresh.current = true;
    setCurrentPageIndex(1);
    getPrompts({ pageIndex: 1 });
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
      <Header variant="h1">Stage a New System Prompt</Header>
      <SpaceBetween size="l">
        {error && (
          <Alert header="Error" type="error">
            {error}
          </Alert>
        )}
        <Textarea
          placeholder="Start a new system prompt from scratch"
          value={promptText}
          onChange={(e) => setPromptText(e.detail.value)}
          rows={10}
        />
        <Button onClick={handleStagePrompt} disabled={!promptText || isSaving}>
          {isSaving ? 'Staging...' : 'Stage This Prompt'}
        </Button>
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
          header={
            <Header
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button iconName="refresh" onClick={onRefresh} />
                </SpaceBetween>
              }
            >
              Start a new system prompt from an existing prompt
            </Header>
          }
          empty={
            !loadingPrompts && (
              <Box textAlign="center">
                <StatusIndicator type="warning">
                  No staged prompts found.
                </StatusIndicator>
              </Box>
            )
          }
          pagination={
            pages.length === 0 ? null : (
              <Pagination
                openEnd={true}
                pagesCount={pages.length}
                currentPageIndex={currentPageIndex}
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
