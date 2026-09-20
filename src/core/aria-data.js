// ARIA 1.2 reference data (abstract roles excluded — they are not author-valid).
export const VALID_ROLES = new Set([
  'alert','alertdialog','application','article','associationlist','associationlistitemkey',
  'associationlistitemvalue','banner','blockquote','button','caption','cell','checkbox',
  'code','columnheader','combobox','comment','complementary',
  'contentinfo','definition','deletion','dialog','directory','document','emphasis',
  'feed','figure','form','generic','grid','gridcell','group','heading','img',
  'insertion','link','list','listbox','listitem','log','main','mark','marquee',
  'math','menu','menubar','menuitem','menuitemcheckbox','menuitemradio','meter','navigation',
  'none','note','option','paragraph','presentation','progressbar','radio','radiogroup',
  'region','row','rowgroup','rowheader','scrollbar','search','searchbox',
  'separator','slider','spinbutton','status','strong',
  'subscript','superscript','switch','tab','table','tablist','tabpanel','term',
  'textbox','timer','toolbar','tooltip','tree','treegrid','treeitem'
]);

// Abstract roles are invalid when used by authors.
export const ABSTRACT_ROLES = new Set([
  
  'window'
]);

export const GLOBAL_ARIA = new Set([
  'aria-atomic','aria-busy','aria-controls','aria-current','aria-describedby','aria-description',
  'aria-details','aria-disabled','aria-dropeffect','aria-errormessage','aria-flowto','aria-grabbed',
  'aria-haspopup','aria-hidden','aria-invalid','aria-keyshortcuts','aria-label','aria-labelledby',
  'aria-live','aria-owns','aria-relevant','aria-roledescription'
]);

export const ARIA_ATTRIBUTES = new Set([
  ...GLOBAL_ARIA,
  'aria-activedescendant','aria-autocomplete','aria-checked','aria-colcount','aria-colindex',
  'aria-colspan','aria-expanded','aria-haspopup','aria-hidden','aria-level','aria-modal',
  'aria-multiline','aria-multiselectable','aria-orientation','aria-placeholder','aria-posinset',
  'aria-pressed','aria-readonly','aria-required','aria-rowcount','aria-rowindex','aria-rowspan',
  'aria-selected','aria-setsize','aria-sort','aria-valuemax','aria-valuemin','aria-valuenow',
  'aria-valuetext','aria-colindextext','aria-rowindextext'
]);

export const TOKEN_VALUES = {
  'aria-autocomplete': ['inline','list','both','none'],
  'aria-checked': ['true','false','mixed','undefined'],
  'aria-current': ['page','step','location','date','time','true','false'],
  'aria-disabled': ['true','false'],
  'aria-expanded': ['true','false','undefined'],
  'aria-haspopup': ['true','false','menu','listbox','tree','grid','dialog'],
  'aria-hidden': ['true','false','undefined'],
  'aria-invalid': ['grammar','spelling','true','false'],
  'aria-live': ['assertive','polite','off'],
  'aria-modal': ['true','false'],
  'aria-multiline': ['true','false'],
  'aria-multiselectable': ['true','false'],
  'aria-orientation': ['horizontal','vertical','undefined'],
  'aria-pressed': ['true','false','mixed','undefined'],
  'aria-readonly': ['true','false'],
  'aria-required': ['true','false'],
  'aria-selected': ['true','false','undefined'],
  'aria-sort': ['ascending','descending','none','other'],
  'aria-relevant': ['additions','removals','text','all','additions text']
};

// Roles that require specific owned child roles.
export const REQUIRED_OWNED = {
  list: ['listitem'],
  menu: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  menubar: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  radiogroup: ['radio'],
  tablist: ['tab'],
  listbox: ['option'],
  grid: ['row'],
  row: ['cell', 'columnheader', 'rowheader', 'gridcell'],
  tree: ['treeitem'],
  treegrid: ['treeitem']
};
