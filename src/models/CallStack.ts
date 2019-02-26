export enum LineType {
  Start,
  End,
  Start_ext,
  End_ext,
  Resume,
  Reend,
  Sql,
  SqlBind,
  Constructor,
  Function,
  Method,
  Getter,
  Setter
}

export type CallStackLine = {
  line_number: number;
  type: LineType;
  text: string;
  nest: number;
  dur: string;
};
