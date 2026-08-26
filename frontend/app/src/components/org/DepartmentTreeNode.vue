<template>
  <div class="dept-tree-row" :style="{ paddingLeft: depth * 24 + 'px' }">
    <button
      v-if="node.children && node.children.length > 0"
      class="expand-btn"
      @click="expanded = !expanded"
    >
      <i :class="['mdi', expanded ? 'mdi-chevron-down' : 'mdi-chevron-right']" style="font-size: 16px"></i>
    </button>
    <i v-else class="mdi mdi-folder" style="font-size: 16px; color: var(--colorNeutralForeground3); margin-left: 16px"></i>

    <span style="font-size: var(--fontSizeBase200); font-weight: var(--fontWeightSemibold); flex: 1; margin-left: var(--spacingHorizontalS);">{{ node.name }}</span>

    <FluentChip v-if="managerName" color="info" small variant="subtle" style="margin-right: var(--spacingHorizontalS);">
      {{ managerName }}
    </FluentChip>
    <span v-if="node.description" style="font-size: var(--fontSizeBase100); color: var(--colorNeutralForeground3); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: var(--spacingHorizontalS);">
      {{ node.description }}
    </span>

    <fluent-button appearance="subtle" size="small" @click="$emit('setManager', node)" title="设负责人">
      <i class="mdi mdi-account" style="font-size: 14px"></i>
    </fluent-button>
    <fluent-button appearance="subtle" size="small" @click="$emit('edit', node)" title="编辑">
      <i class="mdi mdi-pencil" style="font-size: 14px"></i>
    </fluent-button>
    <fluent-button appearance="subtle" size="small" @click="$emit('delete', node)" title="删除" style="color: var(--colorPaletteRedForeground1);">
      <i class="mdi mdi-delete" style="font-size: 14px"></i>
    </fluent-button>
  </div>
  <div v-if="expanded && node.children && node.children.length > 0">
    <DepartmentTreeNode
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :members="members"
      :all-flat="allFlat"
      :depth="depth + 1"
      @edit="$emit('edit', $event)"
      @delete="$emit('delete', $event)"
      @set-manager="$emit('setManager', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DepartmentNode, Department } from '../../api/department'
import type { Member } from '../../api/user'
import FluentChip from '../FluentChip.vue'

const props = defineProps<{
  node: DepartmentNode
  members: Member[]
  allFlat: Department[]
  depth: number
}>()

const emit = defineEmits<{
  edit: [dept: Department]
  delete: [dept: Department]
  setManager: [dept: Department]
}>()

const expanded = ref(true)

const managerName = computed(() => {
  if (props.node.managerUserId == null) return ''
  const m = props.members.find(m => m.userId === props.node.managerUserId)
  return m ? m.name : ''
})
</script>

<style scoped>
.dept-tree-row {
  display: flex;
  align-items: center;
  padding: var(--spacingVerticalXS) var(--spacingHorizontalS);
  gap: var(--spacingHorizontalXS);
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 2px;
  cursor: pointer;
  border-radius: var(--borderRadiusSmall);
  color: var(--colorNeutralForeground2);
  transition: background-color 0.15s ease;
}

.expand-btn:hover {
  background: var(--colorNeutralBackground1Hover);
}
</style>
