export class SQLStatement {
  line_number: number; // line number corresponding with call stack
  text: string; // the sql statement text
  duration: string; // the duration of the sql statement

  // A sql statement could have multiple bind variables
  binds: SQLBind[];

  constructor() {
    this.binds = [];
  }

  addBind(number: number, type: number, length: number, value: string) {
    let found: boolean = false;
    this.binds.forEach(bind => {
      if (bind.number == number) {
        found = true;
      }
    });

    if (!found) this.binds.push(new SQLBind(number, type, length, value));
  }
}

class SQLBind {
  number: number;
  type: number;
  length: number;
  value: string;

  constructor(number: number, type: number, length: number, value: string) {
    this.number = number;
    this.type = type;
    this.length = length;
    this.value = value;
  }
}
