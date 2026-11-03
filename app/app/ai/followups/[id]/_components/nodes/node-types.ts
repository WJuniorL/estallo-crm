import type { NodeTypes } from "@xyflow/react";

import { TriggerNode } from "./TriggerNode";
import { WaitNode } from "./WaitNode";
import { ConditionNode } from "./ConditionNode";
import { ClassifyNode } from "./ClassifyNode";
import { MatchReplyNode } from "./MatchReplyNode";
import { RepeatNode } from "./RepeatNode";
import { ActionNode } from "./ActionNode";
import { EndNode } from "./EndNode";
import { CollectNode } from "./CollectNode";
import { InternalTaskNode } from "./InternalTaskNode";
import { MoveLeadNode } from "./MoveLeadNode";
import { EditLeadTagNode } from "./EditLeadTagNode";
import { SkillNode } from "./SkillNode";

/** Os cartões de cada tipo de bloco — o MESMO conjunto no construtor e na inspeção de uma execução. */
// Defined outside the component — React Flow warns (and re-mounts nodes) if
// nodeTypes is a fresh object every render.
export const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  wait: WaitNode,
  condition: ConditionNode,
  ai_classify: ClassifyNode,
  match_reply: MatchReplyNode,
  repeat: RepeatNode,
  action: ActionNode,
  // `internal_task` estava na paleta, no schema, no publish e no motor — e não
  // aqui (#1540): o React Flow caía no fallback da caixa desconhecida, sem
  // rótulo e sem formulário. Completar o nó é esta linha mais o formulário do
  // painel (`forms/InternalTaskForm`).
  internal_task: InternalTaskNode,
  // #2065 — as duas caixas novas da issue: sem estas linhas o React Flow cai
  // no fallback da caixa desconhecida (o mesmo defeito do #1540 medido ali em
  // cima), sem rótulo e sem formulário.
  move_lead: MoveLeadNode,
  edit_lead_tag: EditLeadTagNode,
  end: EndNode,
  collect: CollectNode,
  skill: SkillNode,
};
