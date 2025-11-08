import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, ActionIcon, TextInput, Button, Group } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import { MdEdit, MdSave, MdCancel } from "react-icons/md";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedValues, setEditedValues] = React.useState<Record<string, string>>({});
  const [waitingForUpdate, setWaitingForUpdate] = React.useState(false);
  const [localDisplayData, setLocalDisplayData] = React.useState<NodeData | null>(null);
  const nodeData = useGraph(state => state.selectedNode);
  const nodes = useGraph(state => state.nodes);
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  const contents = useFile(state => state.contents);
  const setContents = useFile(state => state.setContents);

  // Reset edit mode when modal opens/closes
  React.useEffect(() => {
    if (opened) {
      setIsEditing(false);
      setEditedValues({});
      setWaitingForUpdate(false);
      setLocalDisplayData(null);
    }
  }, [opened]);

  // Watch for node updates after save
  React.useEffect(() => {
    if (waitingForUpdate && nodeData?.id) {
      const updatedNode = nodes.find(node => node.id === nodeData.id);
      if (updatedNode && JSON.stringify(updatedNode) !== JSON.stringify(nodeData)) {
        setSelectedNode(updatedNode);
        setLocalDisplayData(null); // Clear local data once real update arrives
        setWaitingForUpdate(false);
      }
    }
  }, [nodes, waitingForUpdate, nodeData, setSelectedNode]);

  const handleEdit = () => {
    // Initialize edited values with current values
    const initialValues: Record<string, string> = {};
    nodeData?.text?.forEach(row => {
      if (row.key && row.type !== "array" && row.type !== "object") {
        initialValues[row.key] = String(row.value ?? "");
      }
    });
    setEditedValues(initialValues);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedValues({});
  };

  const handleSave = async () => {
    try {
      // Parse the current JSON
      const jsonData = JSON.parse(contents);
      
      // Navigate to the node using the path
      let target = jsonData;
      const path = nodeData?.path ?? [];
      
      // Navigate to the parent of the target
      for (let i = 0; i < path.length; i++) {
        target = target[path[i]];
      }
      
      // Update the values
      Object.entries(editedValues).forEach(([key, value]) => {
        // Try to parse as number or boolean, otherwise keep as string
        let parsedValue: any = value;
        if (value === "true") parsedValue = true;
        else if (value === "false") parsedValue = false;
        else if (value === "null") parsedValue = null;
        else if (!isNaN(Number(value)) && value !== "") parsedValue = Number(value);
        
        target[key] = parsedValue;
      });
      
      // Create local display data immediately for instant feedback
      const updatedNodeData: NodeData = {
        ...nodeData!,
        text: nodeData!.text.map(row => {
          if (row.key && editedValues[row.key] !== undefined) {
            let parsedValue: any = editedValues[row.key];
            if (parsedValue === "true") parsedValue = true;
            else if (parsedValue === "false") parsedValue = false;
            else if (parsedValue === "null") parsedValue = null;
            else if (!isNaN(Number(parsedValue)) && parsedValue !== "") parsedValue = Number(parsedValue);
            
            return { ...row, value: parsedValue };
          }
          return row;
        })
      };
      
      // Update local display immediately
      setLocalDisplayData(updatedNodeData);
      
      // Update the contents in the background
      const newContents = JSON.stringify(jsonData, null, 2);
      await setContents({ contents: newContents });
      
      // Exit edit mode and wait for node update
      setIsEditing(false);
      setEditedValues({});
      setWaitingForUpdate(true);
    } catch (error) {
      console.error("Failed to update JSON:", error);
    }
  };

  const handleInputChange = (key: string, value: string) => {
    setEditedValues(prev => ({ ...prev, [key]: value }));
  };

  // Get editable rows (exclude arrays and objects)
  const editableRows = nodeData?.text?.filter(
    row => row.key && row.type !== "array" && row.type !== "object"
  ) ?? [];

  // Use local display data if available, otherwise use nodeData
  const displayData = localDisplayData || nodeData;

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex align="center" gap="xs">
              {isEditing ? (
                <>
                  <Button 
                    variant="subtle" 
                    color="gray" 
                    onClick={handleCancel}
                    leftSection={<MdCancel size={16} />}
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSave}
                    leftSection={<MdSave size={16} />}
                    size="sm"
                    disabled={editableRows.length === 0}
                  >
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <ActionIcon 
                    onClick={handleEdit} 
                    variant="subtle" 
                    color="gray"
                    aria-label="Edit node"
                  >
                    <MdEdit size={16} />
                  </ActionIcon>
                  <CloseButton onClick={onClose} />
                </>
              )}
            </Flex>
          </Flex>
          
          {isEditing ? (
            <ScrollArea.Autosize mah={400} maw={600}>
              <Stack gap="sm" miw={350}>
                {editableRows.map((row, index) => (
                  <Flex key={index} align="center" gap="sm">
                    <Text fz="sm" fw={500} style={{ minWidth: "120px" }}>
                      {row.key}:
                    </Text>
                    <TextInput
                      value={editedValues[row.key!] ?? ""}
                      onChange={(e) => handleInputChange(row.key!, e.currentTarget.value)}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                  </Flex>
                ))}
                {editableRows.length === 0 && (
                  <Text fz="sm" c="dimmed">
                    No editable fields available for this node.
                  </Text>
                )}
              </Stack>
            </ScrollArea.Autosize>
          ) : (
            <ScrollArea.Autosize mah={250} maw={600}>
              <CodeHighlight
                code={normalizeNodeData(displayData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            </ScrollArea.Autosize>
          )}
        </Stack>
        
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(displayData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
