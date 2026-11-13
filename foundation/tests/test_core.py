import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from src import core

class CoreTests(unittest.TestCase):
    def test_isolation_and_approval(self):
        with tempfile.TemporaryDirectory() as d, patch.object(core, 'DB_PATH', Path(d)/'test.db'):
            core.remember('legal', 'privileged draft', 'manual')
            self.assertEqual(core.recall('personal'), [])
            self.assertEqual(len(core.recall('legal')), 1)
            with self.assertRaises(ValueError):
                core.request_action('legal','unknown_action',{})
            request = core.request_action('legal','legal_filing',{'title':'draft'})
            core.review_action(request, False)
            with self.assertRaises(ValueError):
                core.review_action(request, True)

if __name__ == '__main__': unittest.main()
